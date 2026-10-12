import React, { useId } from 'react';
import './OutputOptions.css';

// Each pair is a sliding switch; each side draws what the destination ends up
// looking like, so the choice reads at a glance. Native radios underneath: arrow
// keys, focus and screen readers for free.

const Photo = ({ x, y, className = '' }) => (
    <g className={className} transform={`translate(${x} ${y})`}>
        <rect width="14" height="11" rx="2" />
        <path d="M2 9l3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5" />
    </g>
);

const Folder = ({ x, y }) => (
    <path transform={`translate(${x} ${y})`} d="M0 2a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.5h6a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-10.5a1.5 1.5 0 0 1-1.5-1.5z" />
);

const GLYPHS = {
    // One folder, photos straight inside it.
    flat: (
        <>
            <Folder x={2} y={2} />
            <path d="M9 14v10h5" />
            <Photo x={16} y={19} /><Photo x={32} y={19} /><Photo x={48} y={19} />
        </>
    ),
    // One folder, its subfolders kept, photos inside those.
    tree: (
        <>
            <Folder x={2} y={2} />
            <path d="M9 14v19M9 19h5M9 33h5M31 19h3M31 33h3" />
            <Folder x={16} y={13} /><Folder x={16} y={27} />
            <Photo x={36} y={13} /><Photo x={36} y={27} />
        </>
    ),
    // Two copies of one photo, both sorted.
    all: (
        <g transform="translate(6 10) scale(1.5)">
            <Photo x={0} y={2} /><Photo x={20} y={2} />
        </g>
    ),
    // The second copy is left out.
    skip: (
        <g transform="translate(6 10) scale(1.5)">
            <Photo x={0} y={2} /><Photo x={20} y={2} className="glyph-skipped" />
        </g>
    ),
};

const ChoiceGroup = ({ title, name, value, onChange, options, disabled, ...rest }) => {
    const id = useId();
    const current = options.find((o) => o.value === value);
    return (
        <fieldset className="choice-group" disabled={disabled} aria-describedby={`${id}-hint`} {...rest}>
            <legend>{title}</legend>
            <div className={`choice-options ${value === options[1].value ? 'is-second' : ''}`}>
                <span className="choice-thumb" aria-hidden="true" />
                {options.map((o) => (
                    <label key={String(o.value)} className={`choice ${o.value === value ? 'is-selected' : ''}`}>
                        <input
                            type="radio"
                            name={name}
                            checked={o.value === value}
                            onChange={() => onChange(o.value)}
                        />
                        <svg className="choice-glyph" viewBox="0 0 64 42" aria-hidden="true">{GLYPHS[o.glyph]}</svg>
                        <span className="choice-label">{o.label}</span>
                    </label>
                ))}
            </div>
            <p id={`${id}-hint`} className="choice-hint">{current?.hint}</p>
        </fieldset>
    );
};

const OutputOptions = ({ maintainHierarchy, setMaintainHierarchy, skipDuplicates, setSkipDuplicates, isProcessing }) => (
    <section className="output-options" aria-label="Output">
        <ChoiceGroup
            title="Folder structure"
            name="folder-structure"
            value={maintainHierarchy}
            onChange={setMaintainHierarchy}
            disabled={isProcessing}
            data-tutorial-target="hierarchy-toggle"
            options={[
                { value: false, glyph: 'flat', label: 'Flat output', hint: 'Photos go straight into each sorted folder.' },
                { value: true, glyph: 'tree', label: 'Recreate structure', hint: 'Your original subfolders are kept inside each sorted folder.' },
            ]}
        />
        <ChoiceGroup
            title="Duplicates"
            name="skip-duplicates"
            value={skipDuplicates}
            onChange={setSkipDuplicates}
            disabled={isProcessing}
            data-tutorial-target="skip-duplicates"
            options={[
                { value: false, glyph: 'all', label: 'Sort every photo', hint: 'Every photo is sorted, copies included.' },
                { value: true, glyph: 'skip', label: 'Skip duplicates', hint: 'Photos already in the destination, and extra copies in the source, stay where they are. The best copy is sorted.' },
            ]}
        />
    </section>
);

export default OutputOptions;
