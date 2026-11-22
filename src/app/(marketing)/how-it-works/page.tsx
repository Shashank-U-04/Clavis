import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "How it works",
  description: "Describe a home, review the plan, change it by hand or by asking, and walk through it. Nothing changes until you apply it.",
};

const STEPS = [
  ["Describe", "Sign in with Google, then type what the home needs: how many bedrooms and bathrooms, a study, an open kitchen, roughly how big. Or start from a template, or a blank sheet."],
  ["Review", "Clavis lays out the rooms to scale, joins them with a hall, places doors and windows and furnishes each room. Anything that needs attention, such as a door with furniture in front of it, is marked on the plan."],
  ["Change", "Move walls and furniture yourself, type exact sizes, or ask for a change in your own words. A suggestion is drawn on the plan first, new parts in green and removed parts dashed in red, with the problems it would fix or cause."],
  ["Apply", "Your design changes only when you press Apply. Anything that removes work asks first, and every change can be undone."],
  ["Walk through", "Open the 3D view to see the home standing up, then walk through it from the front door with a figure at real height."],
  ["Keep", "Projects save to your account as you work, and open on any device you sign in on. Export a printable plan or a 3D model whenever you like."],
];

const WHERE = [
  ["In your account", "You sign in with Google. Your projects are kept in your account, private to you, and open on any device you sign in on."],
  ["In your browser", "The drawing, the 3D view, the checks and the built-in assistant run on your device, with a working copy of your projects, so the studio stays quick."],
  ["On our server", "A request goes to a hosted AI model, with a short summary of the design, only when the built-in assistant cannot handle it, or when you choose the hosted model in Settings. Choose Clavis Local there and nothing leaves your browser."],
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader trail={[{ href: "/how-it-works", label: "How it works" }]} title="From a description to a home you can walk through." intro="Six steps. You decide what changes at each one." />
      <Section sheet="01" title="The steps.">
        <ol>
          {STEPS.map(([t, d], i) => (
            <li key={t} className="grid border-b border-rule md:grid-cols-[14rem_1fr]">
              <div className="flex items-baseline gap-4 border-b border-rule-soft p-5 md:border-b-0 md:border-r md:border-rule md:p-8">
                <span className="text-4xl font-semibold tracking-[-0.05em] text-paper-3">0{i + 1}</span>
                <span className="label text-marker">{t}</span>
              </div>
              <p className="max-w-3xl p-5 text-lg text-ink-2 md:p-8">{d}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section sheet="02" title="Where your designs are kept.">
        <div className="grid md:grid-cols-3">
          {WHERE.map(([t, d], i) => (
            <div key={t} className={`border-b border-rule p-5 md:border-b-0 md:p-8 ${i < 2 ? "md:border-r" : ""}`}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-ink-2">{d}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-rule p-5 md:p-8">
          <ButtonLink href="/new">Start designing</ButtonLink>
        </div>
      </Section>
    </>
  );
}
