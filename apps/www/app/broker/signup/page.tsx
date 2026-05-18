export default function BrokerSignupPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <div className="rounded-[28px] border border-[#243040] bg-[#101722]/90 p-8 shadow-card">
        <h1 className="font-display text-4xl text-white">Join PropAI Pro</h1>
        <p className="mt-4 text-base leading-7 text-[#c8d3df]">
          PropAI Pro keeps your listings indexable, routes verified leads back into your workflow, and enables WhatsApp contact without dumping raw phone numbers onto public listing pages.
        </p>
        <a href="https://app.propai.live/pricing" className="mt-8 inline-flex rounded-full bg-[#3EE88A] px-5 py-3 font-semibold text-black">
          View plans
        </a>
      </div>
    </main>
  );
}
