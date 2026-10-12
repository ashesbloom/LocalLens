import React, { useEffect, useMemo, useState } from 'react';
import { List, Square, ChevronLeft, ChevronRight, Star, X } from 'react-feather';
import ConfirmationModal from './ConfirmationModal';
import {
    KEEP_ALL, defaultView, initialKeepers, pathsToTrash, reclaimBytes, afterDelete, formatBytes,
} from './duplicateSelection';
import './DuplicateReview.css';

const baseName = (p) => p.split(/[\\/]/).pop();
const parentName = (p) => p.split(/[\\/]/).slice(-2, -1)[0] || p;
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const Tile = ({ path, info, keep, error, large, apiBase, onPick }) => {
    const [broken, setBroken] = useState(false);
    return (
        <button
            type="button"
            className={`dup-tile ${keep ? 'keep' : 'trash'} ${large ? 'large' : ''} ${error ? 'failed' : ''}`}
            onClick={onPick}
            title={error ? `${path}\nCould not remove: ${error}` : path}
        >
            <span className="dup-badge">{keep ? <><Star size={12} /> Keep</> : <><X size={12} /> Trash</>}</span>
            {broken ? (
                <div className="dup-thumb dup-thumb-missing">No preview</div>
            ) : (
                <img
                    className="dup-thumb"
                    loading="lazy"
                    alt={baseName(path)}
                    src={`${apiBase}/api/thumbnail?path=${encodeURIComponent(path)}`}
                    onError={() => setBroken(true)}
                />
            )}
            <span className="dup-meta">{info ? `${info.width}×${info.height} · ${formatBytes(info.bytes)}` : baseName(path)}</span>
            <span className="dup-meta dup-folder">{parentName(path)}</span>
        </button>
    );
};

const Group = ({ group, label, keeper, files, failed, large, apiBase, setKeeper }) => {
    const keepAll = keeper === KEEP_ALL;
    const save = reclaimBytes(pathsToTrash([group], [keeper]), files);
    return (
        <section className="dup-group">
            <header className="dup-group-header">
                <span>{label} · {group.length} photos{save ? ` · save ${formatBytes(save)}` : ''}</span>
                <button
                    type="button"
                    className={`dup-keep-all ${keepAll ? 'active' : ''}`}
                    onClick={() => setKeeper(keepAll ? group[0] : KEEP_ALL)}
                >
                    {keepAll ? 'Keeping all' : 'Keep all'}
                </button>
            </header>
            <div className="dup-tiles">
                {group.map((p) => (
                    <Tile
                        key={p}
                        path={p}
                        info={files[p]}
                        keep={keepAll || keeper === p}
                        error={failed[p]}
                        large={large}
                        apiBase={apiBase}
                        onPick={() => setKeeper(p)}
                    />
                ))}
            </div>
        </section>
    );
};

const DuplicateReview = ({ isOpen, result, apiBase, apiCall, onClose, onCleaned }) => {
    const [groups, setGroups] = useState([]);
    const [keeper, setKeepers] = useState([]);
    const [view, setView] = useState('list');
    const [index, setIndex] = useState(0);
    const [failed, setFailed] = useState({});
    const [preview, setPreview] = useState(null); // dry-run response while confirming
    const [busy, setBusy] = useState(false);

    // A new scan starts a fresh review. Closing and reopening keeps every choice,
    // because the component stays mounted and only renders nothing while closed.
    useEffect(() => {
        const g = result?.groups || [];
        setGroups(g);
        setKeepers(initialKeepers(g));
        setView(defaultView(g.length, result?.strictness));
        setIndex(0);
        setFailed({});
    }, [result]);

    const files = result?.files || {};
    const trash = useMemo(() => pathsToTrash(groups, keeper), [groups, keeper]);
    const bytes = reclaimBytes(trash, files);
    const setKeeper = (i) => (k) => setKeepers((prev) => prev.map((v, j) => (j === i ? k : v)));

    useEffect(() => {
        // Nothing may change behind the confirmation dialog.
        if (!isOpen || preview) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') return onClose();
            if (view !== 'single') return;
            const g = groups[index];
            if (!g) return;
            if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, groups.length - 1));
            else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
            else if (e.key.toLowerCase() === 'k') setKeeper(index)(KEEP_ALL);
            else if (/^[1-9]$/.test(e.key) && g[Number(e.key) - 1]) setKeeper(index)(g[Number(e.key) - 1]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, preview, view, groups, index]);

    // Dry run first: it tells us whether the Trash is available before we promise it.
    const askConfirm = async () => {
        setBusy(true);
        try {
            setPreview(await apiCall('/api/delete-files', {
                method: 'POST',
                body: JSON.stringify({ file_paths: trash, dry_run: true }),
            }));
        } catch { /* apiCall already logged it */ } finally { setBusy(false); }
    };

    const clean = async () => {
        // The whole selection, not preview.deleted: the dry run silently drops files
        // that have vanished, and sending them gets each one flagged as failed instead.
        const paths = trash;
        setPreview(null);
        setBusy(true);
        try {
            const r = await apiCall('/api/delete-files', {
                method: 'POST',
                body: JSON.stringify({ file_paths: paths, dry_run: false }),
            });
            const next = afterDelete(groups, keeper, r.deleted);
            setGroups(next.groups);
            setKeepers(next.keeper);
            setIndex((i) => Math.min(i, Math.max(next.groups.length - 1, 0)));
            setFailed(Object.fromEntries(r.failed.map((f) => [f.path, f.error])));
            onCleaned(r, next.groups.length);
        } catch { /* apiCall already logged it */ } finally { setBusy(false); }
    };

    if (!isOpen) return null;

    const scanFoundNone = (result?.groups || []).length === 0;
    const common = { files, failed, apiBase };

    return (
        <div className="dup-overlay">
            <div className="dup-panel" role="dialog" aria-label="Review duplicates">
                <header className="dup-header">
                    <div>
                        <h2>Review duplicates</h2>
                        <p>
                            {groups.length
                                ? `${count(groups.length, "group")} · ${count(trash.length, "extra copy", "extra copies")} · ${formatBytes(bytes)} reclaimable`
                                : scanFoundNone ? 'No duplicates found in this folder.' : 'All cleaned up.'}
                        </p>
                    </div>
                    {groups.length > 0 && (
                        <div className="dup-view-toggle" role="tablist" aria-label="Review view">
                            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                                <List size={16} /> List
                            </button>
                            <button role="tab" aria-selected={view === 'single'} className={view === 'single' ? 'active' : ''} onClick={() => setView('single')}>
                                <Square size={16} /> One by one
                            </button>
                        </div>
                    )}
                    <button className="dup-close" onClick={onClose} title="Close" aria-label="Close"><X size={22} /></button>
                </header>

                {groups.length > 0 && <p className="dup-hint">The best copy is pre-selected. Click a photo to keep that one instead.</p>}

                <div className="dup-body">
                    {groups.length === 0 ? (
                        <div className="dup-empty">{scanFoundNone ? 'Every photo here is one of a kind.' : 'Nothing left to review.'}</div>
                    ) : view === 'list' ? (
                        groups.map((g, i) => (
                            <Group key={i} group={g} label={`Group ${i + 1}`} keeper={keeper[i]} setKeeper={setKeeper(i)} {...common} />
                        ))
                    ) : (
                        <>
                            <Group large group={groups[index]} label={`Group ${index + 1} of ${groups.length}`} keeper={keeper[index]} setKeeper={setKeeper(index)} {...common} />
                            <nav className="dup-nav">
                                <button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} /> Prev</button>
                                <button className="btn btn-secondary" disabled={index === groups.length - 1} onClick={() => setIndex(index + 1)}>Next <ChevronRight size={16} /></button>
                            </nav>
                            <p className="dup-keys">← → move between groups · 1–9 choose the keeper · K keep all</p>
                        </>
                    )}
                </div>

                <footer className="dup-footer">
                    <span className="dup-footer-note">Removed photos go to the Trash. You can restore them from there.</span>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" disabled={!trash.length || busy} onClick={askConfirm}>
                        {busy ? 'Working…' : `Move ${count(trash.length, "file")} to Trash`}
                    </button>
                </footer>
            </div>

            <ConfirmationModal
                isVisible={!!preview}
                title={preview?.use_trash === false ? 'Delete permanently?' : 'Move to Trash?'}
                onCancel={() => setPreview(null)}
                onConfirm={clean}
                confirmText={preview?.use_trash === false ? 'Delete permanently' : 'Move to Trash'}
                cancelText="Cancel"
            >
                <p>
                    {preview?.use_trash === false
                        ? <>The Trash is unavailable, so <strong>{count(preview?.deleted.length ?? 0, "file")} ({preview?.total_freed_mb} MB)</strong> will be deleted permanently. This cannot be undone.</>
                        : <>Move <strong>{count(preview?.deleted.length ?? 0, "file")} ({preview?.total_freed_mb} MB)</strong> to the Trash? The kept copy of each photo stays where it is.</>}
                </p>
            </ConfirmationModal>
        </div>
    );
};

export default DuplicateReview;
