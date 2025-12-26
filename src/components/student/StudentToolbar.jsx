import React from 'react';
import { Pen, Eraser, Pointer, Undo, Redo, Trash2 } from 'lucide-react';

const ColorButtons = ({ color, onChange, className }) => (
  <div className={className}>
    <button
      onClick={() => onChange('black')}
      className={`${className.includes('color') ? 'color-button' : 'mobile-color-button'} ${
        color === 'black' ? 'active' : ''
      }`}
      style={{ background: 'black' }}
      aria-label="Black"
    />
    <button
      onClick={() => onChange('#0066FF')}
      className={`${className.includes('color') ? 'color-button' : 'mobile-color-button'} ${
        color === '#0066FF' ? 'active' : ''
      }`}
      style={{ background: '#0066FF' }}
      aria-label="Blue"
    />
    <button
      onClick={() => onChange('#00AA00')}
      className={`${className.includes('color') ? 'color-button' : 'mobile-color-button'} ${
        color === '#00AA00' ? 'active' : ''
      }`}
      style={{ background: '#00AA00' }}
      aria-label="Green"
    />
  </div>
);

const MobileToolbar = ({
  color,
  onColorChange,
  tool,
  onToolChange,
  inputMode,
  onToggleInputMode,
  onUndo,
  onRedo,
  onClear,
  undoDisabled,
  redoDisabled,
}) => (
  <div className="mobile-toolbar">
    <ColorButtons color={color} onChange={onColorChange} className="mobile-colors" />
    <div className="mobile-tools">
      <button
        onClick={() => onToolChange('pen')}
        className={`mobile-tool-button ${tool === 'pen' ? 'active' : ''}`}
        aria-label="Pen"
      >
        <Pen size={20} />
      </button>
      <button
        onClick={() => onToolChange('eraser')}
        className={`mobile-tool-button ${tool === 'eraser' ? 'active' : ''}`}
        aria-label="Eraser"
      >
        <Eraser size={20} />
      </button>
      <button
        onClick={onToggleInputMode}
        className={`mobile-tool-button ${inputMode === 'all' ? 'active' : ''}`}
        aria-label={inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
        title={inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
      >
        <Pointer size={20} />
      </button>
      <button
        onClick={onUndo}
        className="mobile-tool-button"
        disabled={undoDisabled}
        aria-label="Undo"
      >
        <Undo size={20} />
      </button>
      <button
        onClick={onRedo}
        className="mobile-tool-button"
        disabled={redoDisabled}
        aria-label="Redo"
      >
        <Redo size={20} />
      </button>
      <button onClick={onClear} className="mobile-tool-button danger" aria-label="Clear">
        <Trash2 size={20} />
      </button>
    </div>
  </div>
);

const DesktopToolbar = ({
  color,
  onColorChange,
  tool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  inputMode,
  onToggleInputMode,
  onUndo,
  onRedo,
  onClear,
  undoDisabled,
  redoDisabled,
}) => (
  <div className="student-sidebar">
    <div className="sidebar-section">
      <h3 className="sidebar-label">COLORS</h3>
      <ColorButtons color={color} onChange={onColorChange} className="color-buttons" />
    </div>

    <div className="sidebar-section">
      <h3 className="sidebar-label">TOOLS</h3>
      <div className="tool-buttons tool-icon-buttons">
        <button
          onClick={() => onToolChange('pen')}
          className={`tool-icon-button ${tool === 'pen' ? 'active' : ''}`}
          title="Pen"
        >
          <i className="pi pi-pencil tool-icon"></i>
          <span className="tool-label">Pen</span>
        </button>
        <button
          onClick={() => onToolChange('eraser')}
          className={`tool-icon-button ${tool === 'eraser' ? 'active' : ''}`}
          title="Eraser"
        >
          <i className="pi pi-eraser tool-icon"></i>
          <span className="tool-label">Eraser</span>
        </button>
      </div>
    </div>

    <div className="sidebar-section">
      <h3 className="sidebar-label">BRUSH SIZE</h3>
      <div className="brush-size-control">
        <div className="brush-slider-container">
          <input
            type="range"
            min="1"
            max="10"
            value={brushSize}
            onChange={(e) => onBrushSizeChange(parseInt(e.target.value, 10))}
            className="brush-slider"
          />
          <span className="brush-value">{brushSize}</span>
        </div>
      </div>
    </div>

    <div className="sidebar-section">
      <h3 className="sidebar-label">INPUT MODE</h3>
      <button
        className={`input-mode-toggle ${inputMode === 'all' ? 'all-inputs' : ''}`}
        onClick={onToggleInputMode}
      >
        {inputMode === 'stylus-only' ? 'Stylus mode (pen only)' : 'All inputs'}
      </button>
    </div>

    <div className="sidebar-section">
      <h3 className="sidebar-label">HISTORY</h3>
      <div className="history-buttons">
        <button onClick={onUndo} className="history-button" disabled={undoDisabled}>
          Undo
        </button>
        <button onClick={onRedo} className="history-button" disabled={redoDisabled}>
          Redo
        </button>
        <button onClick={onClear} className="history-button danger">
          Clear
        </button>
      </div>
    </div>
  </div>
);

const StudentToolbar = (props) => {
  const { isMobile } = props;

  if (isMobile) {
    return <MobileToolbar {...props} />;
  }

  return <DesktopToolbar {...props} />;
};

export default StudentToolbar;
