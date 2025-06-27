import React from 'react';
import { Sliders, Search, Trello, UserPlus } from 'react-feather';

const SortingModeSelector = ({ operationMode, setOperationMode, onEnrollClick }) => {
  const modes = [
    {
      key: 'standard',
      title: 'Standard Sort',
      description: 'Organize all photos into a clear structure based on one rule.',
      icon: <Trello size={18} />,
    },
    {
      key: 'hybrid',
      title: 'Hybrid Sort',
      description: 'Isolate a specific set of photos and sort the rest normally.',
      icon: <Sliders size={18} />,
    },
    {
      key: 'find',
      title: 'Find & Group',
      description: 'Copy photos that match complex criteria into a new folder.',
      icon: <Search size={18} />,
    },
  ];

  return (
    <div className="mode-selector-container">
      <div className="mode-selector-bar" role="tablist" aria-label="Sorting Modes">
        {modes.map((mode) => (
          <button
            key={mode.key}
            className={`mode-selector-btn ${operationMode === mode.key ? 'active' : ''}`}
            onClick={() => setOperationMode(mode.key)}
            title={mode.description} // Description now appears on hover
            role="tab"
            aria-selected={operationMode === mode.key}
          >
            {mode.icon}
            <span>{mode.title}</span>
          </button>
        ))}
      </div>
      {(operationMode === 'hybrid' || operationMode === 'find') && (
        <button 
          className="btn-enroll-shortcut" 
          onClick={onEnrollClick}
          title="Open Face Enrollment"
          aria-label="Open Face Enrollment"
        >
          <UserPlus size={18} />
        </button>
      )}
    </div>
  );
};

export default SortingModeSelector;