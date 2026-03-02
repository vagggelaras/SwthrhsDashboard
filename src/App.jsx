import { useState } from 'react'
import Tabs from './components/Tabs'
import ProvidersTab from './components/ProvidersTab'
import PlansTab from './components/PlansTab'
import PlansByCategoryTab from './components/PlansByCategoryTab'
import SettingsTab from './components/SettingsTab'
import './App.css'

const tabs = ['Providers', 'Plans', 'Ανά Κατηγορία', 'Settings']

export default function App() {
  const [activeTab, setActiveTab] = useState('Providers')

  return (
    <div className="admin-app">
      <header className="admin-header">
        <h1>Admin Dashboard</h1>
        <span className="admin-subtitle">EnergyCompare</span>
      </header>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <main className="admin-main">
        {activeTab === 'Providers' && <ProvidersTab />}
        {activeTab === 'Plans' && <PlansTab />}
        {activeTab === 'Ανά Κατηγορία' && <PlansByCategoryTab />}
        {activeTab === 'Settings' && <SettingsTab />}
      </main>
    </div>
  )
}
