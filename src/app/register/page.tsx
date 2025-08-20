"use client";
import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({ username: "", name: "", password: "", email: "", desiredRole: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
  body: JSON.stringify(form),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* leere/ungültige Antwort */ }
      if (!res.ok) {
        setError(data?.error || `Fehler (${res.status})`);
      } else {
        setSuccess("Registrierung erfolgreich! Du kannst dich jetzt einloggen.");
  setForm({ username: "", name: "", password: "", email: "", desiredRole: "" });
      }
    } catch {
      setError('Netzwerkfehler');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Registrieren</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="username"
          placeholder="Benutzername"
          value={form.username}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="email"
          name="email"
          placeholder="E-Mail (optional)"
          value={form.email}
          onChange={handleChange}
          className="w-full p-2 border rounded"
        />
        <input
          type="text"
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Passwort"
          value={form.password}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />
        <select
          name="desiredRole"
          value={form.desiredRole}
          onChange={handleChange}
          className="w-full p-2 border rounded"
        >
          <option value="">Lernende/r (Standard)</option>
          <option value="author">Autor (Freischaltung nötig)</option>
          <option value="teacher">Lehrperson (Freischaltung nötig)</option>
        </select>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-semibold">Registrieren</button>
  <p className="text-center text-xs text-gray-600">Schon registriert? <a href="/login" className="text-blue-600 underline">Zum Login</a></p>
      </form>
      {error && <p className="text-red-600 mt-4">{error}</p>}
  {success && (
        <div className="text-green-600 mt-4">
          {success}
          <br />
          <a href="/login" className="text-blue-600 underline">Jetzt einloggen</a>
        </div>
      )}
  <p className="mt-6 text-xs text-gray-500 leading-relaxed">Standard ist Lernende/r. Wenn du Autor oder Lehrperson auswählst, startest du als pending und musst freigeschaltet werden.</p>
    </div>
  );
}
