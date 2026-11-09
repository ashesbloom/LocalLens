"""
Vision Core encoder: one exported model directory in, image and text embeddings out.

Everything model-specific comes from the directory scripts/vision_export.py wrote:
  model.json      sizes, resample filter, mean/std, text rules, logit scale/bias, onnx sha256s
  tokenizer.json  the model's own tokenizer, with the post-processor that appends EOS
  vision.onnx     pixel_values (N,3,H,W) float32 -> image_embeds (N,D)
  text.onnx       input_ids (N,L) int64 -> text_embeds (N,D)

Nothing is hard-coded per model. SigLIP 2 resizes bilinear and SigLIP 1 multilingual bicubic;
both squash to a square with no crop. Getting any of that wrong costs accuracy without an error,
which is why gate G0 reproduces the paper's numbers before anything else is trusted.

Sessions load on first use: indexing never pays for the text tower (mostly a 256k-token
embedding table) and a query never pays for the vision tower.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

_RESAMPLE = {"bilinear": Image.Resampling.BILINEAR, "bicubic": Image.Resampling.BICUBIC}


def preprocess(img, cfg):
    """PIL image -> float32 (3,H,W), as the model's Hugging Face image processor does it.

    Module-level and config-only, so pool workers can run it without loading onnxruntime.
    """
    h, w = cfg["image_size"]
    img = img.convert("RGB").resize((w, h), _RESAMPLE[cfg["resample"]])
    x = np.asarray(img, dtype=np.float32) * np.float32(1.0 / 255.0)
    x = (x - np.asarray(cfg["mean"], np.float32)) / np.asarray(cfg["std"], np.float32)
    return np.ascontiguousarray(x.transpose(2, 0, 1))


def crop_view(img, k, n=3):
    """The k-th (1..n) square crop along the photo's long side, the short side wide: left/centre/right
    for landscape, top/middle/bottom for portrait. Squashing to the model's square distorts 4:3 and
    16:9 frames and shrinks small things; the crops see them at their true shape (option crops)."""
    w, h = img.size
    s = min(w, h)
    off = round((max(w, h) - s) * (k - 1) / (n - 1))
    return img.crop((off, 0, off + s, s) if w >= h else (0, off, s, off + s))


def l2_normalize(x):
    x = np.asarray(x, np.float32)
    return x / np.maximum(np.linalg.norm(x, axis=1, keepdims=True), 1e-12)


class Encoder:
    def __init__(self, model_dir, lowercase=None, providers=None, threads=0):
        self.dir = Path(model_dir)
        raw = (self.dir / "model.json").read_bytes()
        self.cfg = json.loads(raw)
        self.name = self.cfg["name"]
        # Names the image vectors this model produces. model.json holds the sha256 of both onnx
        # files and every preprocessing value, so any change to them re-indexes.
        self.engine_id = f"{self.name}-{hashlib.sha256(raw).hexdigest()[:12]}"
        self.lowercase = self.cfg["lowercase"] if lowercase is None else bool(lowercase)
        self.tokenizer_sha = hashlib.sha256((self.dir / "tokenizer.json").read_bytes()).hexdigest()[:12]
        self.providers = providers or ["CPUExecutionProvider"]
        self.threads = threads
        self._vision = self._text = self._tok = None

    def _session(self, filename):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = self.threads
        return ort.InferenceSession(str(self.dir / filename), so, providers=self.providers)

    def embed_arrays(self, x):
        """(N,3,H,W) float32 from preprocess() -> (N,D) unit vectors."""
        if self._vision is None:
            self._vision = self._session("vision.onnx")
        return l2_normalize(self._vision.run(None, {"pixel_values": np.asarray(x, np.float32)})[0])

    def embed_images(self, images, batch=32):
        out = [self.embed_arrays(np.stack([preprocess(im, self.cfg) for im in images[i:i + batch]]))
               for i in range(0, len(images), batch)]
        return np.concatenate(out) if out else np.zeros((0, self.cfg["dim"]), np.float32)

    def tokenize(self, texts):
        """Texts -> (N,L) int64: the model's tokenizer, EOS appended, right-padded to max_length."""
        if self._tok is None:
            from tokenizers import Tokenizer
            tok = Tokenizer.from_file(str(self.dir / "tokenizer.json"))
            n = self.cfg["max_length"]
            tok.enable_truncation(max_length=n)
            tok.enable_padding(length=n, pad_id=self.cfg["pad_id"], pad_token=self.cfg["pad_token"])
            self._tok = tok
        texts = [t.lower() for t in texts] if self.lowercase else list(texts)
        return np.array([e.ids for e in self._tok.encode_batch(texts)], dtype=np.int64)

    def embed_texts(self, texts, batch=64):
        if self._text is None:
            self._text = self._session("text.onnx")
        texts = list(texts)
        out = [l2_normalize(self._text.run(None, {"input_ids": self.tokenize(texts[i:i + batch])})[0])
               for i in range(0, len(texts), batch)]
        return np.concatenate(out) if out else np.zeros((0, self.cfg["dim"]), np.float32)

    def probability(self, sims):
        """Cosine similarity -> the model's own match probability (SigLIP's sigmoid head)."""
        z = (np.asarray(sims, np.float32) * np.float32(np.exp(self.cfg["logit_scale"]))
             + np.float32(self.cfg["logit_bias"]))
        return 1.0 / (1.0 + np.exp(-np.clip(z, -60, 60)))
