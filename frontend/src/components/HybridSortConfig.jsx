import React, { useMemo, useState } from 'react';
import { Calendar, MapPin, Users, FolderPlus, Loader, AlertTriangle, Search } from 'react-feather';

// NEW: A more compact version of SortingOptions for the base rule.
const CompactSortingOptions = ({ sortMethod, setSortMethod, isProcessing, isEnrolled }) => {
    const options = [
        { id: 'Date', title: 'By Date', disabled: false },
        { id: 'Location', title: 'By Location', disabled: false },
        { id: 'People', title: 'By People', disabled: !isEnrolled, tooltip: !isEnrolled ? 'Enroll faces to enable' : '' },
    ];
    return (
        <div className="compact-sorting-options">
            {options.map(opt => (
                <button 
                    key={opt.id}
                    className={`compact-sort-btn ${sortMethod === opt.id ? 'active' : ''}`}
                    onClick={() => setSortMethod(opt.id)}
                    disabled={opt.disabled || isProcessing}
                    title={opt.tooltip}
                >
                    {opt.title}
                </button>
            ))}
        </div>
    );
};


const HybridSortConfig = ({
  metadata,
  isScanningMetadata,
  hybridConfig,
  setHybridConfig,
  isEnrolled,
  faceMode,
  setFaceMode,
  isProcessing
}) => {
  const { baseSort, filterType, filterValues, folderName } = hybridConfig;
  const { years = [], months = [] } = filterValues;
  const [searchTerm, setSearchTerm] = useState('');

  const handleBaseSortChange = (newSortMethod) => {
    setHybridConfig(prev => ({ ...prev, baseSort: newSortMethod }));
  };

  const handleFilterTypeChange = (newFilterType) => {
    setHybridConfig(prev => ({ ...prev, filterType: newFilterType, filterValues: {} }));
    setSearchTerm('');
  };

  const handleFolderNameChange = (e) => {
    setHybridConfig(prev => ({ ...prev, folderName: e.target.value }));
  };

  const handlePillToggle = (name, value) => {
    setHybridConfig(prev => {
        const currentValues = prev.filterValues[name] || [];
        const newValues = currentValues.includes(value)
            ? currentValues.filter(v => v !== value)
            : [...currentValues, value];
        
        const newFilterValues = { ...prev.filterValues, [name]: newValues };

        if (name === 'years') {
            newFilterValues.months = [];
        }

        return { ...prev, filterValues: newFilterValues };
    });
  };

  const availableMonths = useMemo(() => {
    if (!years.length || !metadata?.dates) return [];
    const monthSet = new Set();
    years.forEach(year => {
        if (metadata.dates[year]) {
            metadata.dates[year].forEach(month => monthSet.add(month));
        }
    });
    return Array.from(monthSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [years, metadata?.dates]);

  const monthNames = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', 
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };

  const renderFilterInputs = () => {
    if (isScanningMetadata) {
      return (
        <div className="metadata-loader">
          <Loader className="animate-spin" size={24} />
          <p>Scanning source folder for available dates, locations, and people...</p>
        </div>
      );
    }

    if (!metadata && !isScanningMetadata) {
        return (
            <div className="metadata-loader-error">
                <AlertTriangle size={24} />
                <p>Could not find metadata. Ensure the source folder is correct and contains photos.</p>
            </div>
        )
    }

    const renderPillFilter = (items, selectedItems, pillType) => {
        const filteredItems = items.filter(item => item.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
            <div className="filter-pills-list scrollable-pills">
                {filteredItems.length > 0 ? filteredItems.map(item => (
                    <button 
                        key={item} 
                        className={`filter-pill ${selectedItems.includes(item) ? 'selected' : ''}`} 
                        onClick={() => handlePillToggle(pillType, item)}
                        disabled={isProcessing}
                    >
                        {item}
                    </button>
                )) : <span className="no-results-text">No results found for "{searchTerm}"</span>}
            </div>
        );
    };

    switch (filterType) {
      case 'Date':
        const yearOptions = metadata?.dates ? Object.keys(metadata.dates).sort((a, b) => b - a) : [];
        return (
          <div className="enhanced-filter-container date-filter">
            <div className="filter-pills-list year-pills">
                {yearOptions.length > 0 ? yearOptions.map(year => (
                    <button key={year} className={`filter-pill ${years.includes(year) ? 'selected' : ''}`} onClick={() => handlePillToggle('years', year)} disabled={isProcessing}>
                        {year}
                    </button>
                )) : <span className="no-results-text">No date metadata found.</span>}
            </div>
            {years.length > 0 && (
                <div className="month-pills-container">
                    <h4 className="pills-subtitle">Select Months (optional)</h4>
                    <div className="filter-pills-list month-pills">
                        {availableMonths.map(month => (
                            <button key={month} className={`filter-pill month ${months.includes(month) ? 'selected' : ''}`} onClick={() => handlePillToggle('months', month)} disabled={isProcessing}>
                                {monthNames[month]}
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>
        );
      case 'Location':
      case 'People':
        const items = (filterType === 'Location' ? metadata.locations : metadata.people) || [];
        const selectedItems = (filterType === 'Location' ? filterValues.locations : filterValues.people) || [];
        // CORRECTED: This now uses the proper state key ('locations' or 'people').
        const pillType = filterType === 'Location' ? 'locations' : 'people';

        return (
            <div className="enhanced-filter-container list-filter">
                <div className="filter-search-bar">
                    <Search size={18} className="search-icon" />
                    <input 
                        type="text"
                        placeholder={`Search ${filterType.toLowerCase()}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={isProcessing}
                    />
                </div>
                {renderPillFilter(items, selectedItems, pillType)}
            </div>
        );
      default:
        return null;
    }
  };

  const filterTypes = [
    { key: 'Date', icon: <Calendar size={20} />, label: 'By Date' },
    { key: 'Location', icon: <MapPin size={20} />, label: 'By Location' },
    { key: 'People', icon: <Users size={20} />, label: 'By People', disabled: !isEnrolled },
  ];

  return (
    <div className="hybrid-config-container">
      <div className="config-section compact-base-sort">
        <h3 className="config-section-title">1. Base Sorting Rule</h3>
        <p className="config-section-description">For photos <strong>not</strong> matching the filter.</p>
        <CompactSortingOptions
          sortMethod={baseSort}
          setSortMethod={handleBaseSortChange}
          isProcessing={isProcessing}
          isEnrolled={isEnrolled}
        />
        {baseSort === 'People' && (
          <div className="face-mode-selector hybrid-face-mode">
            <h4 className="face-mode-title">Face Detection Mode</h4>
            <div className="radio-group">
              {['loose', 'balanced', 'strict'].map(mode => (
                <label key={mode} className="radio-label" data-disabled={isProcessing}>
                  <input
                    type="radio"
                    name="hybridFaceMode"
                    value={mode}
                    checked={faceMode === mode}
                    onChange={() => setFaceMode(mode)}
                    disabled={isProcessing}
                    className="radio-input"
                  />
                  <span className="radio-custom">
                    <span className="radio-custom-dot"></span>
                  </span>
                  <span className="radio-text">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="config-section special-filter-section">
        <h3 className="config-section-title">2. Special Filter Rule</h3>
        <p className="config-section-description">Create one rule to isolate a specific group of photos into their own folder.</p>
        <div className="filter-type-selector">
          {filterTypes.map(ft => (
            <button
              key={ft.key}
              className={`filter-type-btn ${filterType === ft.key ? 'active' : ''}`}
              onClick={() => handleFilterTypeChange(ft.key)}
              disabled={ft.disabled || isProcessing}
              title={ft.disabled ? 'Face Enrollment is required for this filter' : ''}
            >
              {ft.icon}
              <span>{ft.label}</span>
            </button>
          ))}
        </div>
        <div className="filter-inputs">
          {renderFilterInputs()}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section-title">3. Special Folder Name</h3>
        <p className="config-section-description">Name the folder that will contain the photos matching your special filter.</p>
        <div className="input-group">
            <div className="icon"><FolderPlus size={18} /></div>
            <input
                type="text"
                className="input-field with-icon"
                placeholder="e.g., Summer Vacation 2024"
                value={folderName}
                onChange={handleFolderNameChange}
                disabled={isProcessing}
            />
        </div>
      </div>
    </div>
  );
};

export default HybridSortConfig;