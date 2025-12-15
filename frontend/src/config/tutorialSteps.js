import { use } from "react";

export const tutorialSteps = [
    // --- Getting Started ---
    {
        target: '[data-tutorial-target="path-preset-group"]',
        content: 'This is where you can select what photos to sort, where to store them, and save your configuration for later use.',
        position: 'right',
        group: 'Getting Started',
        title: 'Path & Preset Overview'
    },
    {
        target: '[data-tutorial-target="source-selector"]',
        content: 'Select the Source Folder containing the photos you want to organize.',
        position: 'right',
        group: 'Getting Started',
        title: 'Source Folder'
    },
    {
        target: '[data-tutorial-target="destination-selector"]',
        content: 'Choose the Destination Folder where your organized photos will be moved or copied to.',
        position: 'right',
        group: 'Getting Started',
        title: 'Destination Folder'
    },
    {
        target: '[data-tutorial-target="preset-manager"]',
        content: 'Use the Preset Manager to save your current folder paths and settings. You can quickly load them next time!',
        position: 'right',
        group: 'Getting Started',
        title: 'Preset Manager'
    },
    // --- Folder Management ---
    {
        target: '[data-tutorial-target="subfolder-selector"]',
        content: 'Here you can see all the subfolders inside your source folder. This gives you full control over which folders to include when organizing your photos.',
        position: 'top',
        requiresDemoData: 'subfolders',
        group: 'Folder Management',
        title: 'Subfolder Selector'
    },
    {
        target: '[data-tutorial-target="subfolder-list"]',
        content: 'Check the box next to any folder to exclude it from sorting. You can even ignore a parent folder while keeping its child folders included — giving you flexible, fine-grained control!',
        position: 'top',
        requiresDemoData: 'subfolders',
        demoAnimation: 'subfolder-toggle',
        group: 'Folder Management',
        title: 'Include/Exclude Folders'
    },
    {
        target: '[data-tutorial-target="hierarchy-toggle"]',
        content: 'Choose how your sorted photos are organized. "Flat Output" puts all photos directly into date/location folders. "Recreate Structure" keeps your original subfolder layout inside each sorted folder — perfect if you want to preserve how your photos were already organized!',
        position: 'top',
        demoAnimation: 'hierarchy-toggle',
        group: 'Folder Management',
        title: 'Output Structure'
    },
    // --- Face Recognition ---
    {
        target: '[data-tutorial-target="sort-by-faces"]',
        content: '**FLAGSHIP FEATURE** — Sort photos by the people in them! Local Lens uses AI-powered facial recognition to automatically group your photos by person. But first, you\'ll need to teach the AI who to look for by enrolling faces.',
        position: 'left',
        isFlagship: true,
        group: 'Face Recognition',
        title: 'Sort by Faces'
    },
    {
        target: '[data-tutorial-target="face-enrollment"]',
        content: '**TRAIN YOUR AI HERE** — This is your Face Enrollment studio! Select 7-10 clear photos of someone\'s face, give them a name, and the AI will learn to recognize them. The more people you enroll, the smarter and faster the recognition becomes!',
        position: 'left',
        isFlagship: true,
        highlightDescription: true,
        group: 'Face Recognition',
        title: 'Face Enrollment Studio'
    },
    {
        target: '[data-tutorial-target="select-photos-btn"]',
        content: 'Start by clicking here to select photos of a person\'s face. Choose 7-10 clear, close-up photos from different angles for the best recognition accuracy!',
        position: 'right',
        isFlagship: true,
        demoAnimation: 'select-photos-demo',
        group: 'Face Recognition',
        title: 'Select Face Photos'
    },
    {
        target: '[data-tutorial-target="person-name-input"]',
        content: 'Enter the person\'s name here. This is how they\'ll be labeled when you sort photos by faces later.',
        position: 'right',
        isFlagship: true,
        requiresDemoData: 'enrollment-name',
        demoAnimation: 'select-photos-demo',
        group: 'Face Recognition',
        title: 'Person Name Input'
    },
    {
        target: '[data-tutorial-target="add-person-btn"]',
        content: 'Click "Add Person" to add them to the enrollment queue. The AI will remember this person once you start the enrollment process.',
        position: 'right',
        isFlagship: true,
        demoAnimation: 'add-person-demo',
        demoAnimation: 'select-photos-demo',
        group: 'Face Recognition',
        title: 'Add to Queue'
    },
    {
        target: '[data-tutorial-target="select-photos-btn"]',
        content: 'You can add **multiple people** to the queue before enrolling! Just repeat the process — but keep an eye on the warning if you\'re enrolling many people at once.',
        position: 'right',
        isFlagship: true,
        group: 'Face Recognition',
        title: 'Multiple Enrollments'
    },
    {
        target: '[data-tutorial-target="enroll-all-btn"]',
        content: 'When you\'re ready, click here to train the AI on everyone in your queue. This process may take a few moments depending on how many photos you\'ve selected.',
        position: 'top',
        isFlagship: true,
        group: 'Face Recognition',
        title: 'Start Training'
    },
    {
        target: '[data-tutorial-target="view-enrolled-btn"]',
        content: 'View all the people your AI has learned to recognize. You can also delete faces from here if needed.',
        position: 'top',
        isFlagship: true,
        group: 'Face Recognition',
        title: 'View Enrolled Faces'
    },
    // --- AI Settings ---
    {
        target: '[data-tutorial-target="sort-by-faces"]',
        content: 'Once faces are enrolled, this option becomes available! Select it to automatically sort your photos into folders by person. The AI will find and group all photos containing each enrolled face.',
        position: 'left',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        demoAnimation: 'select-sort-by-faces',
        group: 'AI Settings',
        title: 'Enable Face Sorting'
    },
    {
        target: '[data-tutorial-target="neural-status"]',
        content: 'This shows how many people your AI has learned to recognize. The more faces you enroll, the better the AI becomes at distinguishing between different people!',
        position: 'top',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        group: 'AI Settings',
        title: 'Neural Network Status'
    },
    {
        target: '[data-tutorial-target="model-strength"]',
        content: 'The **Model Strength** indicator shows how powerful your AI has become. Each person you enroll adds a dot — reach 10 for maximum AI performance with lightning-fast and highly accurate recognition!',
        position: 'top',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        group: 'AI Settings',
        title: 'Model Strength'
    },
    {
        target: '[data-tutorial-target="face-mode-selector"]',
        content: 'Choose how the AI processes your photos. Different modes balance speed vs accuracy depending on your needs.',
        position: 'top',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        group: 'AI Settings',
        title: 'Processing Mode'
    },
    {
        target: '[data-tutorial-target="face-mode-dropdown"]',
        content: '**Fast Mode** Best for large photo collections with clear, close-up faces. Processes quickly while maintaining good accuracy.',
        position: 'top',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        demoAnimation: 'show-face-mode-fast',
        group: 'AI Settings',
        title: 'Fast Mode'
    },
    {
        target: '[data-tutorial-target="face-mode-dropdown"]',
        content: '**Balanced Mode** A perfect middle ground. Slightly more accurate than Fast mode with reasonable processing time. Great for most use cases!',
        position: 'top',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        demoAnimation: 'show-face-mode-balanced',
        group: 'AI Settings',
        title: 'Balanced Mode'
    },
    {
        target: '[data-tutorial-target="face-mode-dropdown"]',
        content: '**Accurate Mode** Maximum precision for finding small or distant faces in group photos. Use this when you need the highest accuracy, but expect slower processing.',
        position: 'top',
        isFlagship: true,
        requiresDemoData: 'enrolled-faces-demo',
        demoAnimation: 'show-face-mode-accurate',
        group: 'AI Settings',
        title: 'Accurate Mode'
    },
    // --- Operation Terminal & Controls Section ---
    {
        target: '[data-tutorial-target="operation-terminal"]',
        content: 'This is the **Operation Terminal** — your real-time log console. Watch live updates as Local Lens processes your photos, including progress messages, warnings, and completion notifications.',
        position: 'top',
        requiresDemoData: 'show-footer',
        group: 'Controls',
        title: 'Operation Terminal'
    },
    {
        target: '[data-tutorial-target="abort-btn"]',
        content: 'Click **Abort** to safely cancel any running operation. Your files remain untouched — only the current process is stopped.',
        position: 'top',
        requiresDemoData: 'show-abort-btn',
        group: 'Controls',
        title: 'Abort Button'
    },
    {
        target: '[data-tutorial-target="open-destination-btn"]',
        content: 'Quickly open your destination folder in File Explorer to see your organized photos.',
        position: 'top',
        requiresDemoData: 'show-footer',
        group: 'Controls',
        title: 'Open Destination'
    },
    {
        target: '[data-tutorial-target="kill-backend-btn"]',
        content: '<danger>Emergency Kill Switch</danger> — Force-terminates all backend processes immediately. Only use if something goes wrong and won\'t respond. No saves, no cleanup.',
        position: 'bottom',
        scrollToTop: true,
        group: 'Controls',
        title: 'Kill Backend'
    },
    {
        target: '[data-tutorial-target="reload-btn"]',
        content: 'Reload the application to refresh the UI and reconnect to the backend. Your settings are preserved.',
        position: 'bottom',
        group: 'Controls',
        title: 'Reload App'
    },
    {
        target: '[data-tutorial-target="notification-panel"]',
        content: 'This is your **Notification Center** — get alerts about new versions and read release notes before updating!',
        position: 'bottom',
        group: 'Controls',
        title: 'Notifications'
    },
    // --- Advanced Modes ---
    {
        target: '[data-tutorial-target="mode-hybrid"]',
        content: '',
        position: 'below-center',
        spotlightShape: 'capsule',
        cardStyle: 'expanded',
        modeTheme: 'hybrid',
        demoAnimation: 'select-hybrid-mode',
        scrollToTop: true,
        group: 'Advanced Modes',
        title: 'Hybrid Sort Mode',
        expandedContent: {
            headline: 'Hybrid Sort',
            tagline: 'Standard Sorting + Smart Filtering',
            description: 'Combine the power of standard sorting with an intelligent filter rule. Sort your entire photo library by date, location, or faces while simultaneously isolating specific photos into a dedicated folder.',
            useCaseTitle: 'When to Use',
            useCase: 'Perfect when you need to organize thousands of photos by date but also want to automatically separate all photos from your hometown, a specific event, or featuring a particular person into their own special folder.',
            features: [
                { label: 'Base Sort', detail: 'Choose Date, Location, or Face sorting for your main library' },
                { label: 'Smart Filter', detail: 'Create one powerful rule to isolate specific photos' },
                { label: 'Custom Folder', detail: 'Name your special folder for filtered photos' }
            ]
        }
    },
    {
        target: '[data-tutorial-target="mode-find"]',
        content: '',
        position: 'below-center',
        spotlightShape: 'capsule',
        cardStyle: 'expanded',
        modeTheme: 'find',
        demoAnimation: 'select-find-mode',
        scrollToTop: true,
        group: 'Advanced Modes',
        title: 'Find & Group Mode',
        expandedContent: {
            headline: 'Find & Group',
            tagline: 'Precision Photo Discovery',
            description: 'Let Local Lens find the photos you\'ve been searching for among thousands. Apply powerful filters based on dates, locations, and faces to pinpoint exactly what you need.',
            useCaseTitle: 'When to Use',
            useCase: 'You remember that amazing sunset photo from your 2019 beach trip with your friend — but it\'s buried in 50,000 photos. Set a month, add the beach location, include your friend\'s face, and let Local Lens find it in seconds.',
            useCaseDec: '(Only one filter is needed, rest are optional for more precision!)',
            features: [
                { label: 'Multi-Filter', detail: 'Stack multiple date, location, and face filters together' },
                { label: 'Smart Search', detail: 'AI-powered face recognition finds people across thousands of photos' },
                { label: 'One-Click Copy', detail: 'Found photos are copied to a named folder, originals stay safe' }
            ]
        }
    }
];

// Helper to get grouped steps for the menu
export const getGroupedSteps = () => {
    const groups = [];
    let currentGroup = null;
    
    tutorialSteps.forEach((step, index) => {
        if (step.group !== currentGroup?.name) {
            currentGroup = { name: step.group, steps: [] };
            groups.push(currentGroup);
        }
        currentGroup.steps.push({ ...step, index });
    });
    
    return groups;
};
