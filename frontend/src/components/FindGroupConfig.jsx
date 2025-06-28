import React, { useState, useMemo } from 'react';
import { Calendar, MapPin, Users, FolderPlus, Loader, AlertTriangle, Search, CheckSquare, Square } from 'react-feather';

const FindGroupConfig = ({
  metadata,
  isScanningMetadata,
  findConfig,
  setFindConfig,
  isEnrolled,
  isProcessing
}) => {
  const [activeFilters, setActiveFilters] = useState({ date: false, location: false, people: false });
  const [searchTerm, setSearchTerm] = useState({ location: '', people: '' });

  const handleToggleFilter = (filter) => {
    setActiveFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
  };

  const handleConfigChange = (key, value) => {
    setFindConfig(prev => ({ ...prev, [key]: value }));
  };

  const handlePillToggle = (name, value) => {
    setFindConfig(prev => {
      const currentValues = prev[name] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      
      const newConfig = { ...prev, [name]: newValues };

      // If years are deselected, also deselect months
      if (name === 'years' && !newValues.length) {
        newConfig.months = [];
      }
      return newConfig;
    });
  };

  const availableMonths = useMemo(() => {
    if (!findConfig.years?.length || !metadata?.dates) return [];
    const monthSet = new Set();
    findConfig.years.forEach(year => {
      if (metadata.dates[year]) {
        metadata.dates[year].forEach(month => monthSet.add(month));
      }
    });
    return Array.from(monthSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [findConfig.years, metadata?.dates]);

  const monthNames = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };

  const renderFilterContent = (filterType) => {
    if (isScanningMetadata) {
      return <div className="metadata-loader"><Loader className="animate-spin" size={24} /><p>Scanning for filter options...</p></div>;
    }
    if (!metadata && !isScanningMetadata) {
      return <div className="metadata-loader-error"><AlertTriangle size={24} /><p>Could not find metadata. Check source folder.</p></div>;
    }

    switch (filterType) {
      case 'date':
        const yearOptions = metadata?.dates ? Object.keys(metadata.dates).sort((a, b) => b - a) : [];
        return (
          <div className="enhanced-filter-container date-filter">
            <div className="filter-pills-list year-pills">
              {yearOptions.length > 0 ? yearOptions.map(year => (
                <button key={year} className={`filter-pill ${findConfig.years?.includes(year) ? 'selected' : ''}`} onClick={() => handlePillToggle('years', year)} disabled={isProcessing}>{year}</button>
              )) : <span className="no-results-text">No date metadata found.</span>}
            </div>
            {findConfig.years?.length > 0 && (
              <div className="month-pills-container">
                <h4 className="pills-subtitle">Select Months (optional)</h4>
                <div className="filter-pills-list month-pills">
                  {availableMonths.map(month => (
                    <button key={month} className={`filter-pill month ${findConfig.months?.includes(month) ? 'selected' : ''}`} onClick={() => handlePillToggle('months', month)} disabled={isProcessing}>{monthNames[month]}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      
      case 'location':
      case 'people':
        const items = (filterType === 'location' ? metadata.locations : metadata.people) || [];
        const selectedItems = (filterType === 'location' ? findConfig.locations : findConfig.people) || [];
        const currentSearchTerm = searchTerm[filterType];
        const filteredItems = items.filter(item => item.toLowerCase().includes(currentSearchTerm.toLowerCase()));

        return (
          <div className="enhanced-filter-container list-filter">
            <div className="filter-search-bar">
              <Search size={18} className="search-icon" />
              <input type="text" placeholder={`Search ${filterType}...`} value={currentSearchTerm} onChange={(e) => setSearchTerm(p => ({...p, [filterType]: e.target.value}))} disabled={isProcessing} />
            </div>
            <div className="filter-pills-list scrollable-pills">
              {filteredItems.length > 0 ? filteredItems.map(item => (
                <button key={item} className={`filter-pill ${selectedItems?.includes(item) ? 'selected' : ''}`} onClick={() => handlePillToggle(filterType === 'location' ? 'locations' : 'people', item)} disabled={isProcessing}>{item}</button>
              )) : <span className="no-results-text">No results found for "{currentSearchTerm}"</span>}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const filters = [
    { key: 'date', icon: <Calendar className="icon" />, label: 'Date Filter', disabled: false },
    { key: 'location', icon: <MapPin className="icon" />, label: 'Location Filter', disabled: false },
    { key: 'people', icon: <Users className="icon" />, label: 'People Filter', disabled: !isEnrolled, tooltip: 'Enroll faces to enable this filter.' },
  ];

  return (
    <div className="find-config-container">
      {filters.map(filter => (
        <div className="find-config-section" key={filter.key}>
          <div className="find-section-header">
            <h4 className="find-section-title">{filter.icon} {filter.label}</h4>
            <button 
              className={`filter-toggle-btn ${activeFilters[filter.key] ? 'active' : ''}`} 
              onClick={() => handleToggleFilter(filter.key)}
              disabled={filter.disabled || isProcessing}
              title={filter.disabled ? filter.tooltip : (activeFilters[filter.key] ? 'Disable' : 'Enable') + ` ${filter.label}`}
            >
              {activeFilters[filter.key] ? <CheckSquare size={18} /> : <Square size={18} />}
              <span>{activeFilters[filter.key] ? 'Enabled' : 'Disabled'}</span>
            </button>
          </div>
          {activeFilters[filter.key] && !filter.disabled && (
            <div className="filter-content">
              {renderFilterContent(filter.key)}
            </div>
          )}
        </div>
      ))}

      <div className="find-config-section">
        <div className="find-section-header">
            <h4 className="find-section-title"><FolderPlus className="icon" /> Destination Folder</h4>
        </div>
        <p className="find-section-description">Name the new folder where matching photos will be copied.</p>
        <div className="input-group find-folder-name">
            <div className="icon"><FolderPlus size={18} /></div>
            <input
                type="text"
                className="input-field with-icon"
                placeholder="e.g., Family Reunion 2024"
                value={findConfig.folderName}
                onChange={(e) => handleConfigChange('folderName', e.target.value)}
                disabled={isProcessing}
            />
        </div>
      </div>
    </div>
  );
};

export default FindGroupConfig;