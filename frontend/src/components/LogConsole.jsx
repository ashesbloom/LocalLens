import React from 'react';

const LogConsole = React.forwardRef(({ logs }, ref) => {
    return (
        <div className="form-group">
            <label>Real-time Log</label>
            <div ref={ref} className="log-console">
                {logs.map((log, index) => (
                    <p key={index} className={`log-${log.type}`}>
                        <span className="log-time">{log.time}</span>
                        <span>&gt;</span>
                        <span style={{marginLeft: '0.5rem'}}>{log.message}</span>
                    </p>
                ))}
            </div>
        </div>
    );
});

export default LogConsole;
