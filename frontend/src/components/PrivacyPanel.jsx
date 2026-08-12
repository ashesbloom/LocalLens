import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ConfirmationModal from './ConfirmationModal';
import './PrivacyPanel.css';

const FILE_LABELS = {
    metadata_store: 'Photo index',
    schedules: 'Schedules',
    face_encodings: 'Face data',
    license_cache: 'Pro license',
    path_presets: 'Saved paths',
};

const LEAVE_LABELS = {
    photos: 'Your photos',
    file_paths: 'File paths',
    face_data: 'Face data',
    survey_answers: 'Survey answers',
    license_key: 'License key',
};

/** Anything not the literal string "Never" is worth the reader's attention. */
const isNever = (v) => v === 'Never';

function PrivacyPanel({ backendPort, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(null);

    const request = useCallback(
        async (path, options = {}) => {
            const token = await invoke('get_local_token');
            const res = await fetch(`http://127.0.0.1:${backendPort}${path}`, {
                ...options,
                headers: { 'Content-Type': 'application/json', 'X-Local-Token': token || '' },
            });
            if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} returned ${res.status}`);
            return res.json();
        },
        [backendPort]
    );

    const load = useCallback(async () => {
        if (!backendPort) {
            setError('LocalLens is not running, so there is nothing to report yet.');
            return;
        }
        try {
            setData(await request('/api/privacy/summary'));
            setError(null);
        } catch (e) {
            setError(`Could not read your data summary. ${e.message}`);
        }
    }, [backendPort, request]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && !confirming && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, confirming]);

    const runAction = async () => {
        const action = confirming;
        setConfirming(null);
        setBusy(true);
        try {
            await request(action.path, { method: action.method });
            await load();
        } catch (e) {
            setError(`${action.title} failed. ${e.message}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
        <div className="pp-overlay" onClick={onClose}>
            <div
                className="pp-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pp-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pp-eyebrow">
                    <span>privacy &amp; data</span>
                    <button className="pp-close" onClick={onClose} aria-label="Close">esc</button>
                </div>

                <h2 id="pp-title">What LocalLens keeps, and what it sends.</h2>

                {error && <div className="pp-error">{error}</div>}

                {data && (
                    <>
                        {/* The headline: the ledger of what crosses the boundary. */}
                        <section className="pp-section">
                            <h3>Leaves this machine</h3>
                            <div className="pp-ledger">
                                {Object.entries(data.data_leaving_machine).map(([k, v]) => (
                                    <div key={k} className={`pp-leave${isNever(v) ? ' never' : ' note'}`}>
                                        <span className="pp-leave-k">{LEAVE_LABELS[k] || k}</span>
                                        <span className="pp-leave-v">{v}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="pp-section">
                            <h3>Stored on this machine</h3>
                            <div className="pp-dir">{data.config_dir}</div>
                            <div className="pp-files">
                                {Object.entries(data.data_files).map(([key, f]) => (
                                    <div key={key} className="pp-file">
                                        <div className="pp-file-head">
                                            <span className="pp-file-name">{FILE_LABELS[key] || key}</span>
                                            <span className="pp-file-size">{f.size}</span>
                                        </div>
                                        <div className="pp-file-path">{f.path}</div>
                                        {key === 'metadata_store' && (
                                            <div className="pp-file-meta">
                                                {f.photo_records.toLocaleString()} photos indexed
                                                {f.suggestion_records > 0 &&
                                                    ` · ${f.suggestion_records} suggestions`}
                                            </div>
                                        )}
                                        {key === 'schedules' && (
                                            <div className="pp-file-meta">
                                                {f.total_schedules} total · {f.active_schedules} active
                                            </div>
                                        )}
                                        {f.purge_note && <div className="pp-file-meta">{f.purge_note}</div>}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="pp-section">
                            <h3>Erase</h3>
                            <div className="pp-actions">
                                <button
                                    className="pp-btn"
                                    disabled={busy || !data.data_files.metadata_store.can_purge}
                                    onClick={() =>
                                        setConfirming({
                                            title: 'Erase the photo index',
                                            body: `This deletes all ${data.data_files.metadata_store.photo_records.toLocaleString()} indexed photo records and every album suggestion. Your actual photo files are not touched. LocalLens will rebuild the index next time it scans.`,
                                            confirmText: 'Erase index',
                                            path: '/api/metadata-store/purge',
                                            method: 'DELETE',
                                        })
                                    }
                                >
                                    Erase photo index
                                </button>

                                {data.ai.persona_active && (
                                    <button
                                        className="pp-btn"
                                        disabled={busy}
                                        onClick={() =>
                                            setConfirming({
                                                title: 'Reset your profile',
                                                body: 'This deletes your survey answers and the profile built from them. Album suggestions will go back to generic grouping.',
                                                confirmText: 'Reset profile',
                                                path: '/api/persona/profile',
                                                method: 'DELETE',
                                            })
                                        }
                                    >
                                        Reset profile
                                    </button>
                                )}

                                {data.ai.cloud_consent_granted && (
                                    <button
                                        className="pp-btn pp-btn-warn"
                                        disabled={busy}
                                        onClick={() =>
                                            setConfirming({
                                                title: 'Revoke cloud consent',
                                                body: `You previously allowed profile synthesis via ${data.ai.cloud_consent_provider}. Revoking means LocalLens will ask again before anything is sent.`,
                                                confirmText: 'Revoke consent',
                                                path: '/api/persona/consent/revoke',
                                                method: 'POST',
                                            })
                                        }
                                    >
                                        Revoke cloud consent ({data.ai.cloud_consent_provider})
                                    </button>
                                )}
                            </div>

                            <p className="pp-foot">
                                Face data is removed per person from Enrolled Faces. Paths older than{' '}
                                {data.auto_compaction.threshold_months} months are compacted automatically —
                                the path is dropped, the grouping is kept.
                            </p>
                        </section>
                    </>
                )}

                {!data && !error && <div className="pp-loading">Reading your data…</div>}
            </div>
        </div>

        {/* Sibling of the overlay, not a child — otherwise its clicks bubble
            into the overlay's onClick and close the panel mid-confirmation. */}
        <ConfirmationModal
            isVisible={!!confirming}
            title={confirming?.title}
            onCancel={() => setConfirming(null)}
            onConfirm={runAction}
            confirmText={confirming?.confirmText}
        >
            <p>{confirming?.body}</p>
        </ConfirmationModal>
        </>
    );
}

export default PrivacyPanel;
