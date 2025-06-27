import React from 'react';

// This component is currently a placeholder. 
// The main progress bar in App.jsx provides feedback during enrollment.
const EnrollmentProgress = ({ enrollmentProgress, enrollmentMessage }) => {
    if (!enrollmentMessage) return null;

    return (
        <div className="enrollment-progress-message">
            <p>{enrollmentMessage}</p>
        </div>
    );
};

export default EnrollmentProgress;
