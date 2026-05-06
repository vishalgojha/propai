'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Users, FileText, Contact as ContactIcon, UserCheck, Search } from 'lucide-react';
import { getContacts, getGroups, type Contact, type Group } from '../lib/api';
import Papa from 'papaparse';

interface RecipientsProps {
  data: {
    numbers: string[];
    groupIds: string[];
    speedMode: string;
  };
  setData: (data: Partial<{ numbers: string[]; groupIds: string[] }>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Recipients({ data, setData, onNext, onBack }: RecipientsProps) {
  const [tab, setTab] = useState<'numbers' | 'csv' | 'contacts' | 'groups'>('numbers');
  const [numberInput, setNumberInput] = useState(data.numbers.join('\n'));
  const [csvInput, setCsvInput] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set(data.numbers));
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(data.groupIds));
  const [contactSearch, setContactSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const [contactsData, groupsData] = await Promise.all([getContacts(), getGroups()]);
      setContacts(contactsData);
      setGroups(groupsData);
    } catch (e) {
      console.error('Failed to load contacts/groups', e);
    }
  }, []);

  useEffect(() => {
    if (tab === 'contacts' || tab === 'groups') {
      loadContacts();
    }
  }, [tab, loadContacts]);

  const handleTabChange = (newTab: 'numbers' | 'csv' | 'contacts' | 'groups') => {
    setTab(newTab);
  };

  const handleNumbersChange = (value: string) => {
    setNumberInput(value);
    const nums = value.split('\n').map(n => n.trim()).filter(n => n);
    setData({ numbers: nums });
  };

  const handleCsvInput = (value: string) => {
    setCsvInput(value);
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (results) => {
        const nums = results.data
          .map((row: unknown) => (Array.isArray(row) ? String(row[0]) : ''))
          .map(n => n.replace(/\D/g, ''))
          .filter(n => n.length >= 10);
        setNumberInput(nums.join('\n'));
        setData({ numbers: nums });
      }
    });
  };

  const toggleContact = (jid: string) => {
    const newSet = new Set(selectedContacts);
    if (newSet.has(jid)) {
      newSet.delete(jid);
    } else {
      newSet.add(jid);
    }
    setSelectedContacts(newSet);
    setData({ numbers: Array.from(newSet) });
  };

  const toggleGroup = (id: string) => {
    const newSet = new Set(selectedGroups);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedGroups(newSet);
    setData({ groupIds: Array.from(newSet) });
  };

  const getRecipientCount = () => {
    if (tab === 'numbers') return data.numbers.length;
    if (tab === 'csv') return csvInput.split('\n').filter(n => n.trim()).length;
    if (tab === 'contacts') return selectedContacts.size;
    return selectedGroups.size;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex-1 flex flex-col"
    >
      <div className="bg-wa-card border border-wa-border rounded-2xl p-6 mb-4 flex-1">
        <h2 className="text-lg font-semibold mb-1">Choose Recipients</h2>
        <p className="text-wa-dim text-sm mb-6">Select how you want to add recipients</p>

        <div className="flex gap-1 mb-6 bg-wa-bg rounded-xl p-1">
          <button
            onClick={() => handleTabChange('numbers')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'numbers' ? 'bg-wa-teal text-white' : 'text-wa-dim'
            }`}
          >
            <FileText size={14} className="inline mr-1" /> Numbers
          </button>
          <button
            onClick={() => handleTabChange('csv')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'csv' ? 'bg-wa-teal text-white' : 'text-wa-dim'
            }`}
          >
            <FileText size={14} className="inline mr-1" /> CSV
          </button>
          <button
            onClick={() => handleTabChange('contacts')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'contacts' ? 'bg-wa-teal text-white' : 'text-wa-dim'
            }`}
          >
            <ContactIcon size={14} className="inline mr-1" /> Contacts
          </button>
          <button
            onClick={() => handleTabChange('groups')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'groups' ? 'bg-wa-teal text-white' : 'text-wa-dim'
            }`}
          >
            <Users size={14} className="inline mr-1" /> Groups
          </button>
        </div>

        {tab === 'numbers' && (
          <div>
            <p className="text-wa-dim text-xs mb-2">Enter phone numbers, one per line (include country code)</p>
            <textarea
              value={numberInput}
              onChange={(e) => handleNumbersChange(e.target.value)}
              placeholder="919876543210&#10;919876543211"
              className="w-full h-40 p-3 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal resize-none font-mono text-sm"
            />
          </div>
        )}

        {tab === 'csv' && (
          <div>
            <p className="text-wa-dim text-xs mb-2">Paste CSV content or upload a file (first column = phone numbers)</p>
            <textarea
              value={csvInput}
              onChange={(e) => handleCsvInput(e.target.value)}
              placeholder="919876543210,John&#10;919876543211,Jane"
              className="w-full h-32 p-3 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal resize-none font-mono text-sm mb-3"
            />
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFile}
              className="text-wa-dim text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-wa-teal file:text-white file:text-sm"
            />
          </div>
        )}

        {tab === 'contacts' && (
          <div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wa-dim" />
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts..."
                className="w-full pl-9 pr-3 py-2 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal text-sm"
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {contacts
                .filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
                .slice(0, 200)
                .map(c => (
                  <label key={c.jid} className="flex items-center gap-3 p-3 bg-wa-bg rounded-xl cursor-pointer hover:bg-wa-border/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(c.jid)}
                      onChange={() => toggleContact(c.jid)}
                      className="w-5 h-5 accent-wa-teal"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-wa-dim">{c.jid.split('@')[0]}</div>
                    </div>
                  </label>
                ))}
            </div>
          </div>
        )}

        {tab === 'groups' && (
          <div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wa-dim" />
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Search groups..."
                className="w-full pl-9 pr-3 py-2 bg-wa-bg border border-wa-border rounded-xl text-wa-text placeholder-wa-dim focus:outline-none focus:border-wa-teal text-sm"
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {groups
                .filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
                .map(g => (
                  <label key={g.id} className="flex items-center gap-3 p-3 bg-wa-bg rounded-xl cursor-pointer hover:bg-wa-border/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="w-5 h-5 accent-wa-teal"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{g.name}</div>
                      <div className="text-xs text-wa-dim">{g.participants.length} members</div>
                    </div>
                  </label>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-wa-card border border-wa-border rounded-xl text-wa-dim hover:text-wa-text transition-colors"
        >
          ← Back
        </button>
        <div className="text-sm text-wa-dim">
          {getRecipientCount()} recipients
        </div>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-3 bg-wa-primary text-wa-bg font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          Next →
        </button>
      </div>
    </motion.div>
  );
}
