import React from 'react';
import { Feather } from 'lucide-react';

const StudentStatusBar = ({
  roomId,
  clientLabel,
  tool,
  inputMode,
  isMobile,
  connectionLabel,
  connectionStateClass,
  toolbarPosition,
  onToggleToolbarPosition,
}) => {
  return (
    <div className="student-status-bar">
      <div className="student-status-text">
        <div className="feather-branding">
          <Feather size={28} strokeWidth={2} />
          <span>Feather</span>
        </div>
        {roomId && <span className="session-info">Session: {roomId}</span>}
        <span className="student-info">{clientLabel}</span>
      </div>
      <div className="student-status-actions">
        {!isMobile ? (
          <>
            <div className="tool-status-indicator">
              <span className="tool-status-text">
                <i className={tool === 'pen' ? 'pi pi-pencil' : 'pi pi-eraser'}></i>{' '}
                {inputMode === 'all' ? 'All inputs' : 'Stylus only'}
              </span>
            </div>
            <div className={`connection-pill ${connectionStateClass}`} aria-live="polite">
              <span className="connection-indicator-dot" />
              <span>{connectionLabel}</span>
            </div>
            <button className="move-toolbar-btn" onClick={onToggleToolbarPosition}>
              Move toolbar to {toolbarPosition === 'left' ? 'right' : 'left'}
            </button>
          </>
        ) : (
          <div className={`connection-pill ${connectionStateClass}`} aria-live="polite">
            <span className="connection-indicator-dot" />
            <span>{connectionLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentStatusBar;
