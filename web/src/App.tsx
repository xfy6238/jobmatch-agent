import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import MatchPage from "./features/match/MatchPage";
import QuizPage from "./features/quiz/QuizPage";
import JobsPage from "./features/jobs/JobsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<MatchPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
