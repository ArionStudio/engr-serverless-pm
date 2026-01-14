import React, { useState } from "react";
import { Button } from "@/ui/components/primitives/button";
import { Search, Plus, Copy, Settings } from "lucide-react";

interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
}

export function Popup() {
  const [passwords, setPasswords] = useState<PasswordEntry[]>([
    {
      id: "1",
      title: "Example Account",
      username: "user@example.com",
      password: "••••••••",
      url: "https://example.com",
    },
  ]);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPasswords = passwords.filter(
    (entry) =>
      entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.username.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCopyPassword = (password: string) => {
    navigator.clipboard.writeText(password);
  };

  const openOptions = () => {
    setPasswords([]);
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="w-80 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🔐 SPM</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openOptions}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search passwords..."
          value={searchTerm}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearchTerm(e.target.value)
          }
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        {filteredPasswords.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No passwords found</p>
        ) : (
          filteredPasswords.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">{entry.title}</h3>
                  <p className="text-xs text-gray-600">{entry.username}</p>
                  <p className="text-xs text-gray-500">{entry.url}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopyPassword(entry.password)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
