import React, { useEffect, useMemo, useRef, useState } from 'react';
import { List, Square, ChevronLeft, ChevronRight, Star, X, Lock, Trash2, Download } from 'react-feather';
import ConfirmationModal from './ConfirmationModal';
import {
    KEEP_ALL, defaultView, initialKeepers, pathsToTrash, reclaimBytes, afterDelete, formatBytes, unprotectedCount, importHandoff,
} from './duplicateSelection';
import './DuplicateReview.css';

const baseName = (p) => p.split(/[\\/]/).pop();
const parentName = (p) => p.split(/[\\/]/).slice(-2, -1)[0] || p;
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const thumbUrl = (apiBase, p) => `${apiBase}/api/thumbnail?path=${encodeURIComponent(p)}`;

// One photo on the light table. Its fate is shown on the photo itself: kept
// copies stay in full colour, copies headed for the Trash go grey.
const Photo = ({ path, info, state, stateLabel, error, apiBase, onPick, stage }) => {
    const [broken, setBroken] = useState(false);
    return (
        <button
            type="button"
            className={`dup-photo is-${state} ${stage ? 'on-stage' : ''} ${error ? 'failed' : ''}`}
            onClick={onPick}
            disabled={!onPick}
            title={error ? `${path}\nCould not remove: ${error}` : path}
        >
            <span className="dup-photo-frame">
                {broken ? (
                    <span className="dup-photo-missing">No preview</span>
                ) : (
                    <img loading="lazy" alt={baseName(path)} src={thumbUrl(apiBase, path)} onError={() => setBroken(true)} />
                )}
            </span>
            <span className="dup-photo-caption">
                {onPick && state === 'trash' && <span className="dup-photo-pick"><Star size={13} /> Keep this one</span>}
                <span className="dup-photo-state">{stateLabel}</span>
                <span className="dup-photo-meta">
                    {info && <span>{info.width}×{info.height}</span>}
                    {info && <span>{formatBytes(info.bytes)}</span>}
                    <span className="dup-photo-folder">{parentName(path)}</span>
                </span>
            </span>
        </button>
    );
};

const Group = ({ group, title, keeper, files, failed, apiBase, setKeeper, compare, protectedPaths, names, stage }) => {
    const keepAll = keeper === KEEP_ALL;
    const save = reclaimBytes(pathsToTrash([group], [keeper], protectedPaths), files);
    const stateOf = (p) => (protectedPaths.has(p) ? 'library' : keepAll || keeper === p ? 'keep' : 'trash');
    const labels = {
        keep: <><Star size={13} /> Keeping</>,
        trash: <><Trash2 size={13} /> To Trash</>,
        library: <><Lock size={13} /> In {names.other}</>,
    };
    return (
        <section className={`dup-group ${stage ? 'on-stage' : ''}`}>
            <header className="dup-group-bar">
                <h3>{title}</h3>
                <span className="dup-group-facts">
                    <span>{count(group.length, 'photo')}</span>
                    {save > 0 && <span>Frees {formatBytes(save)}</span>}
                </span>
                <button
                    type="button"
                    className={`dup-keep-all ${keepAll ? 'active' : ''}`}
                    aria-pressed={keepAll}
                    onClick={() => setKeeper(keepAll ? group[0] : KEEP_ALL)}
                >
                    {compare ? `Keep in ${names.source} too` : 'Keep every copy'}
                </button>
            </header>
            <div className="dup-photos">
                {group.map((p) => (
                    <Photo
                        key={p}
                        path={p}
                        info={files[p]}
                        state={stateOf(p)}
                        stateLabel={labels[stateOf(p)]}
                        error={failed[p]}
                        apiBase={apiBase}
                        stage={stage}
                        onPick={compare || protectedPaths.has(p) ? undefined : () => setKeeper(p)}
                    />
                ))}
            </div>
        </section>
    );
};

// Every group as a strip of frames: where you are, and which groups lose nothing.
const Filmstrip = ({ groups, keeper, index, setIndex, apiBase }) => {
    const strip = useRef(null);
    const active = useRef(null);
    // Scroll the strip itself only: scrollIntoView would also scroll the page behind the overlay.
    useEffect(() => {
        const s = strip.current, f = active.current;
        if (s && f) s.scrollTo({ left: f.offsetLeft - (s.clientWidth - f.clientWidth) / 2, behavior: 'smooth' });
    }, [index]);
    return (
        <div className="dup-filmstrip" role="tablist" aria-label="Groups" ref={strip}>
            {groups.map((g, i) => (
                <button
                    key={g[0]}
                    ref={i === index ? active : null}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    className={`dup-frame ${i === index ? 'active' : ''} ${keeper[i] === KEEP_ALL ? 'kept' : ''}`}
                    onClick={() => setIndex(i)}
                    title={`Group ${i + 1}${keeper[i] === KEEP_ALL ? ': keeping every copy' : ''}`}
                >
                    <img loading="lazy" alt="" src={thumbUrl(apiBase, g[0])} />
                </button>
            ))}
        </div>
    );
};

const DuplicateReview = ({ isOpen, result, apiBase, apiCall, onClose, onCleaned, onImport }) => {
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
    // Compare mode: the other folder's copies are locked, only the scanned side can go.
    const compare = !!result?.libraryFolder;
    const protectedPaths = useMemo(
        () => new Set(Object.keys(result?.files || {}).filter((p) => result.files[p].in_library)),
        [result],
    );
    const trash = useMemo(() => pathsToTrash(groups, keeper, protectedPaths), [groups, keeper, protectedPaths]);
    const names = {
        source: baseName(result?.sourceFolder || '') || 'this folder',
        other: baseName(result?.libraryFolder || '') || 'the other folder',
    };
    const onCard = unprotectedCount(groups, protectedPaths);
    const newCount = result?.newFiles?.length ?? 0;
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
            else if (e.key.toLowerCase() === 'k') setKeeper(index)(keeper[index] === KEEP_ALL ? g[0] : KEEP_ALL);
            else if (!compare && /^[1-9]$/.test(e.key) && g[Number(e.key) - 1]) setKeeper(index)(g[Number(e.key) - 1]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, preview, view, groups, keeper, index, compare]);

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
            const next = afterDelete(groups, keeper, r.deleted, protectedPaths);
            setGroups(next.groups);
            setKeepers(next.keeper);
            setIndex((i) => Math.min(i, Math.max(next.groups.length - 1, 0)));
            setFailed(Object.fromEntries(r.failed.map((f) => [f.path, f.error])));
            onCleaned(r, next.groups.length);
        } catch { /* apiCall already logged it */ } finally { setBusy(false); }
    };

    if (!isOpen) return null;

    const scanFoundNone = (result?.groups || []).length === 0;
    const common = { files, failed, apiBase, compare, protectedPaths, names };

    const title = compare ? `Already in ${names.other}` : 'Review duplicates';
    const summary = compare
        ? (groups.length
            ? `${onCard} of the ${onCard + newCount} photos in ${names.source} are already in ${names.other}. ${newCount} are new.`
            : scanFoundNone ? `None of the ${count(newCount, 'photo')} in ${names.source} are in ${names.other} yet.`
                : `Nothing left in ${names.source} that ${names.other} already has. ${newCount} are new.`)
        : groups.length
            ? `${count(groups.length, 'group')} of duplicates. Removing the extra copies frees ${formatBytes(bytes)}.`
            : scanFoundNone ? 'No duplicates in this folder.' : 'All cleaned up.';
    const keys = compare
        ? `← → move between groups    K keep in ${names.source} too`
        : '← → move between groups    1–9 pick the keeper    K keep every copy';
    const trashLabel = compare
        ? `Move ${trash.length} from ${names.source} to Trash`
        : `Move ${count(trash.length, 'extra copy', 'extra copies')} to Trash`;

    return (
        <div className="dup-overlay">
            <div className="dup-panel" role="dialog" aria-label={title}>
                <header className="dup-header">
                    <div className="dup-heading">
                        <h2>{title}</h2>
                        <p>{summary}</p>
                    </div>
                    {groups.length > 0 && (
                        <div className="dup-view-toggle" role="tablist" aria-label="Review view">
                            <button role="tab" aria-selected={view === 'single'} className={view === 'single' ? 'active' : ''} onClick={() => setView('single')}>
                                <Square size={15} /> One by one
                            </button>
                            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                                <List size={15} /> All groups
                            </button>
                        </div>
                    )}
                    <button className="dup-close" onClick={onClose} title="Close (Esc)" aria-label="Close"><X size={20} /></button>
                </header>

                <div key={view} className={`dup-body ${view === 'single' && groups.length ? 'is-single' : ''}`}>
                    {groups.length === 0 ? (
                        <div className="dup-empty">
                            {scanFoundNone ? (compare ? 'Everything here is new.' : 'Every photo here is one of a kind.') : 'Nothing left to review.'}
                        </div>
                    ) : view === 'list' ? (
                        groups.map((g, i) => (
                            <Group key={g[0]} group={g} title={`Group ${i + 1}`} keeper={keeper[i]} setKeeper={setKeeper(i)} {...common} />
                        ))
                    ) : (
                        <>
                            <div className="dup-stage">
                                <button className="dup-step" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous group">
                                    <ChevronLeft size={22} />
                                </button>
                                <Group stage group={groups[index]} title={`Group ${index + 1} of ${groups.length}`} keeper={keeper[index]} setKeeper={setKeeper(index)} {...common} />
                                <button className="dup-step" disabled={index === groups.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next group">
                                    <ChevronRight size={22} />
                                </button>
                            </div>
                            <Filmstrip groups={groups} keeper={keeper} index={index} setIndex={setIndex} apiBase={apiBase} />
                            <p className="dup-keys">{keys}</p>
                        </>
                    )}
                </div>

                <footer className="dup-footer">
                    <span className="dup-footer-note">Removed photos go to the Trash.</span>
                    <button
                        className={`btn ${compare ? 'dup-btn-quiet' : 'btn-primary'}`}
                        disabled={!trash.length || busy}
                        onClick={askConfirm}
                    >
                        <Trash2 size={16} /> {busy ? 'Working…' : trashLabel}
                    </button>
                    {compare && (
                        <button
                            className="btn btn-primary"
                            disabled={busy || newCount === 0}
                            onClick={() => onImport(importHandoff(result, protectedPaths))}
                            title={`Sort them into ${names.other}`}
                        >
                            <Download size={16} /> {scanFoundNone ? `Import all ${newCount}` : `Import ${count(newCount, 'new photo')}`}
                        </button>
                    )}
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
                        : compare
                            ? <>Move <strong>{count(preview?.deleted.length ?? 0, "file")} ({preview?.total_freed_mb} MB)</strong> from {names.source} to the Trash? Nothing in {names.other} is touched.</>
                            : <>Move <strong>{count(preview?.deleted.length ?? 0, "file")} ({preview?.total_freed_mb} MB)</strong> to the Trash? The kept copy of each photo stays where it is.</>}
                </p>
            </ConfirmationModal>
        </div>
    );
};

export default DuplicateReview;
