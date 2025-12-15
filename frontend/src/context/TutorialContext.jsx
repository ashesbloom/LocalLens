import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { tutorialSteps } from '../config/tutorialSteps';

const TutorialContext = createContext();

export const useTutorial = () => {
    const context = useContext(TutorialContext);
    if (!context) {
        throw new Error('useTutorial must be used within a TutorialProvider');
    }
    return context;
};

export const TutorialProvider = ({ children }) => {
    const [isActive, setIsActive] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isDemoMode, setIsDemoMode] = useState(false);
    
    // Helper to get current step data
    const currentStep = isActive ? tutorialSteps[currentStepIndex] : null;

    const startTutorial = useCallback((fromStep = 0) => {
        setIsActive(true);
        setCurrentStepIndex(fromStep);
        setIsDemoMode(true); // Enable demo mode when tutorial starts
    }, []);

    const stopTutorial = useCallback(() => {
        setIsActive(false);
        setCurrentStepIndex(0);
        setIsDemoMode(false); // Disable demo mode when tutorial ends
    }, []);

    const nextStep = useCallback(() => {
        if (currentStepIndex < tutorialSteps.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
        } else {
            stopTutorial();
        }
    }, [currentStepIndex, stopTutorial]);

    const prevStep = useCallback(() => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    }, [currentStepIndex]);

    const skipTutorial = useCallback(() => {
        stopTutorial();
    }, [stopTutorial]);

    // Handle "onEnter" actions for steps (e.g. opening modals)
    useEffect(() => {
        if (isActive && currentStep && currentStep.onEnter) {
            currentStep.onEnter();
        }
    }, [isActive, currentStepIndex, currentStep]);

    const value = {
        isActive,
        currentStep,
        currentStepIndex,
        totalSteps: tutorialSteps.length,
        isDemoMode,
        startTutorial,
        stopTutorial,
        nextStep,
        prevStep,
        skipTutorial
    };

    return (
        <TutorialContext.Provider value={value}>
            {children}
        </TutorialContext.Provider>
    );
};
