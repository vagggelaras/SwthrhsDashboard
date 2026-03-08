import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './components/LoginPage'
import Tabs from './components/Tabs'
import ProvidersTab from './components/ProvidersTab'
import PlansTab from './components/PlansTab'
import PlansByCategoryTab from './components/PlansByCategoryTab'
import CustomersTab from './components/CustomersTab'
import SettingsTab from './components/SettingsTab'
import AppSettingsTab from './components/AppSettingsTab'
import './App.css'

const ALL_TABS = ['Providers', 'Plans', 'Ανά Κατηγορία', 'Πελάτες', 'Settings', 'App Settings']

export default function App() {
  const [session, setSession] = useState(undefined)
  const [staffInfo, setStaffInfo] = useState(null)
  const [staffLoading, setStaffLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) { setStaffInfo(null); setStaffLoading(true) }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    fetchStaffInfo(session.user.id)
  }, [session])

  async function fetchStaffInfo(userId) {
    setStaffLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      setStaffInfo({ role: 'none', allowed_tabs: [], display_name: '' })
    } else {
      setStaffInfo(data)
    }
    setStaffLoading(false)
  }

  // Loading
  if (session === undefined) return null
  if (!session) return <LoginPage />
  if (staffLoading) return null

  const user = session.user
  const isAdmin = staffInfo?.role === 'admin'
  const allowedTabs = isAdmin ? ALL_TABS : (staffInfo?.allowed_tabs || [])
  const displayName = staffInfo?.display_name || user.user_metadata?.display_name || user.email

  // No access
  if (allowedTabs.length === 0) {
    return (
      <div className="admin-app">
        <div className="no-access">
          <i className="fa-solid fa-lock"></i>
          <h2>Δεν έχεις πρόσβαση</h2>
          <p>Ο λογαριασμός σου δεν έχει ρυθμιστεί ακόμα. Επικοινώνησε με τον διαχειριστή.</p>
          <button className="admin-logout" onClick={() => supabase.auth.signOut()}>
            <i className="fa-solid fa-right-from-bracket"></i> Αποσύνδεση
          </button>
        </div>
      </div>
    )
  }

  // Default to first allowed tab
  const currentTab = activeTab && allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0]

  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1>Admin Dashboard</h1>
          <span className="admin-subtitle">EnergyCompare</span>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">
            <i className="fa-solid fa-user-circle"></i> {displayName}
            {isAdmin && <span className="admin-role-badge">Admin</span>}
          </span>
          <button className="admin-logout" onClick={() => supabase.auth.signOut()}>
            <i className="fa-solid fa-right-from-bracket"></i> Αποσύνδεση
          </button>
        </div>
      </header>
      <Tabs tabs={allowedTabs} active={currentTab} onChange={setActiveTab} />
      <main className="admin-main">
        {currentTab === 'Providers' && <ProvidersTab />}
        {currentTab === 'Plans' && <PlansTab />}
        {currentTab === 'Ανά Κατηγορία' && <PlansByCategoryTab />}
        {currentTab === 'Πελάτες' && <CustomersTab user={user} />}
        {currentTab === 'Settings' && <SettingsTab />}
        {currentTab === 'App Settings' && <AppSettingsTab />}
      </main>
    </div>
  )
}
