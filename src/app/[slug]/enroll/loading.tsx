export default function EnrollLoading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 h-16 w-56 rounded-md bg-[#E8E6E0]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-80 rounded-lg bg-[#F4F2EC]" />
        ))}
      </div>
    </main>
  );
}
