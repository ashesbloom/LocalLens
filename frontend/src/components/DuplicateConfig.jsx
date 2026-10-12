import React from 'react';
import './DuplicateReview.css';

const OPTIONS = [
    { id: 'exact', icon: '🎯', title: 'Exact copies', description: 'The same photo saved twice, renamed or rotated.' },
    { id: 'near', icon: '🔍', title: 'Near-identical', description: 'Also catches resized and re-exported copies. Recommended.' },
    { id: 'similar', icon: '📸', title: 'Similar shots', description: 'Burst shots and near-misses. Worth reviewing one by one.' },
];

const DuplicateConfig = ({ strictness, setStrictness, isProcessing }) => (
    <div className="sorting-options-section" data-tutorial-target="dup-strictness">
        <div className="form-group">
            <label>Match strictness</label>
            <p className="description">How alike two photos must be to count as duplicates. Nothing is removed until you review the results.</p>
        </div>
        <div className="sorting-card-group dup-strictness">
            {OPTIONS.map((o) => (
                <label key={o.id} className={`sorting-card ${strictness === o.id ? 'selected' : ''} ${isProcessing ? 'disabled' : ''}`} title={o.title}>
                    <input
                        type="radio"
                        name="dupStrictness"
                        value={o.id}
                        checked={strictness === o.id}
                        onChange={(e) => setStrictness(e.target.value)}
                        disabled={isProcessing}
                    />
                    <div className="sorting-card-content">
                        <div className="sorting-card-icon">{o.icon}</div>
                        <div className="sorting-card-text">
                            <div className="sorting-card-title">{o.title}</div>
                            <p className="sorting-card-description">{o.description}</p>
                        </div>
                    </div>
                </label>
            ))}
        </div>
    </div>
);

export default DuplicateConfig;
