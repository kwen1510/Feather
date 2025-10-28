import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Student from './pages/Student';
import StudentLogin from './pages/StudentLogin';
import TeacherDashboard from './pages/TeacherDashboard';
import TestStudent from './pages/TestStudent';
import TestTeacher from './pages/TestTeacher';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/student-login" element={<StudentLogin />} />
        <Route path="/student" element={<Student />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/test/student" element={<TestStudent />} />
        <Route path="/test/teacher" element={<TestTeacher />} />
      </Routes>
    </Router>
  );
}

export default App;
