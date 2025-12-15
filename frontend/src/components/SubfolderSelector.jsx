import React, { useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';

// NEW: Recursive component to render each level of the folder tree
const FolderTreeItem = ({ folder, ignoredSubfolders, onToggle, isProcessing }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const isIgnored = ignoredSubfolders.includes(folder.path);

    const handleToggleExpand = (e) => {
        e.stopPropagation(); // Prevent the label's click event from firing
        if (folder.children.length > 0) {
            setIsExpanded(!isExpanded);
        }
    };

    const handleCheckboxClick = () => {
        onToggle(folder);
    };

    return (
        <div className="folder-tree-node">
            <div className={`subfolder-item ${isIgnored ? 'ignored' : ''}`} onClick={handleCheckboxClick}>
                <div className="folder-expander" onClick={handleToggleExpand}>
                    {folder.children.length > 0 && (
                        <ChevronRight
                            size={16}
                            className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}
                        />
                    )}
                </div>
                <input
                    type="checkbox"
                    checked={isIgnored}
                    onChange={() => {}} // Click is handled by the parent div
                    disabled={isProcessing}
                />
                <Folder size={16} className="folder-icon" />
                <span className="folder-name" title={folder.name}>{folder.name}</span>
            </div>
            {isExpanded && folder.children.length > 0 && (
                <div className="folder-tree-children">
                    {folder.children.map(child => (
                        <FolderTreeItem
                            key={child.path}
                            folder={child}
                            ignoredSubfolders={ignoredSubfolders}
                            onToggle={onToggle}
                            isProcessing={isProcessing}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SubfolderSelector = ({ subfolders, ignoredSubfolders, setIgnoredSubfolders, isProcessing, stats, className = '', onAnimationEnd, ...props }) => {
    if (subfolders.length === 0 && !stats) {
        return null;
    }

    const getDescendantPaths = (folder) => {
        const paths = [];
        const queue = [...folder.children];
        while (queue.length > 0) {
            const current = queue.shift();
            paths.push(current.path);
            if (current.children && current.children.length > 0) {
                queue.push(...current.children);
            }
        }
        return paths;
    };

    const handleToggleFolder = (folder) => {
        // RESTORED LOGIC: Toggling a parent affects all its descendants.
        const isCurrentlyIgnored = ignoredSubfolders.includes(folder.path);
        const descendantPaths = getDescendantPaths(folder);

        setIgnoredSubfolders(prev => {
            let newIgnored;
            if (isCurrentlyIgnored) {
                // Un-ignoring: Remove the folder and all its descendants from the ignore list.
                const pathsToRemove = new Set([folder.path, ...descendantPaths]);
                newIgnored = prev.filter(p => !pathsToRemove.has(p));
            } else {
                // Ignoring: Add the folder and all its descendants to the ignore list.
                const pathsToAdd = [folder.path, ...descendantPaths];
                newIgnored = [...new Set([...prev, ...pathsToAdd])];
            }
            return newIgnored;
        });
    };

    return (
        <div className={`subfolder-selector-section ${className}`} onAnimationEnd={onAnimationEnd} {...props}>
            <div className="subfolder-header">
                <div className="form-group">
                    <label>Source Folder Contents</label>
                    <p className="description">
                        A scan of your source folder found the following. Select subfolders to exclude them.
                    </p>
                </div>
                {stats && (
                    <div className="folder-stats">
                        <div>
                            <strong>{stats.file_count}</strong>
                            <span>supported files</span>
                        </div>
                        <div>
                            <strong>{stats.folder_count}</strong>
                            <span>subfolders</span>
                        </div>
                    </div>
                )}
            </div>

            {subfolders.length > 0 && (
                <div className="subfolder-list tree-view" data-tutorial-target="subfolder-list">
                    {subfolders.map(folder => (
                        <FolderTreeItem
                            key={folder.path}
                            folder={folder}
                            ignoredSubfolders={ignoredSubfolders}
                            onToggle={handleToggleFolder}
                            isProcessing={isProcessing}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SubfolderSelector;