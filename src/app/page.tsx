export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200">
      <div className="bg-white rounded shadow p-8 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">Lernarena</h1>
        <p className="mb-8 text-gray-700">Willkommen zur Lernplattform mit Gamification!<br />Bitte logge dich ein oder registriere dich.</p>
        <div className="flex flex-col gap-4">
          <a href="/login" className="bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition">Login</a>
          <a href="/register" className="bg-indigo-600 text-white py-2 rounded font-semibold hover:bg-indigo-700 transition">Registrieren</a>
        </div>
      </div>
    </main>
  );
}
