import { lazy, Suspense } from 'react';

import Navbar from './components/Navbar.jsx';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomeMovie from "./components/homemovie.jsx";
const Page = lazy(() => import('./components/page.jsx'));
const Signup = lazy(() => import('./components/signup.jsx'));
const Login = lazy(() => import('./components/login.jsx'));
const Episode = lazy(() => import('./components/episode.jsx'));
const RemoteEpisode = lazy(() => import('./components/remote-episode.jsx'));
const Actor = lazy(() => import('./components/actor.jsx'));
const Crew = lazy(() => import('./components/crew.jsx'));
const ForgotPassword = lazy(() => import('./components/forgot-password.jsx'));
const ResetPassword = lazy(() => import('./components/reset-password.jsx'));
const Account = lazy(() => import('./components/account.jsx'));
const BrowseSection = lazy(() => import('./components/browse-section.jsx'));
const MyList = lazy(() => import('./components/my-list.jsx'));
import { AccountProvider } from './account-context.jsx';
import './App.css'
import './netflix.css'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}><AccountProvider>
    <div className="App">
      <Navbar />
      <Suspense fallback={<main className="account-page" aria-busy="true"><p role="status">Loading page...</p></main>}><Routes>
        <Route path="/" element={<HomeMovie />} />
        <Route path="/account" element={<Account />} />
        <Route path="/my-list" element={<MyList />} />
        <Route path="/title/tv/:tmdbId/season/:seasonNumber/episode/:episodeNumber" element={<RemoteEpisode />} />
        <Route path="/title/:mediaType/:tmdbId" element={<Page />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/browse/:kind" element={<BrowseSection />} />
        <Route path="/recent" element={<HomeMovie />} />
        <Route path="/recent/page/:pageNo" element={<HomeMovie />} />
        <Route path="/page/:pageNo" element={<HomeMovie />} />
        <Route path="/movie/:movieIndex" element={<Page />}/>
        <Route path="/actor/:actorid" element={<Actor />}/>
        <Route path="/crew/:crewid" element={<Crew />}/>
        <Route path="/movie/:movieIndex/episode/:episode" element={<Episode />}/>
      </Routes></Suspense>
    </div>
    </AccountProvider></BrowserRouter>
  )
}

export default App
