import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Student from './pages/Student';
import TeacherDashboard from './pages/TeacherDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/student" element={<Student />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
