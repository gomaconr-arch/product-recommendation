import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clipboard,
  ClipboardList,
  CalendarDays,
  ExternalLink,
  FileText,
  Link,
  LockKeyhole,
  PhoneCall,
  Plus,
  ReceiptText,
  Radio,
  Send,
  ShieldCheck,
  UserRound
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import products from "../data/products.json";
import pivotRules from "../data/pivot-rules.json";
import { getRecommendations } from "./lib/matchEngine.js";
import { adaptRawAssessmentToMatchInput, createLeadFromRawAssessment, validateRawAssessment } from "./lib/rawAssessmentAdapter.js";
import { validateMatchingInput, validatePivotRules, validateProducts } from "./lib/validation.js";
import {
  createPublicShareToken,
  getLead,
  getLeads,
  getProposal,
  getProposalByToken,
  getProposals,
  saveLead,
  saveProposal,
  updateLead,
  updateProposal
} from "./lib/storage.js";

const AGENT_ID = "advisor-demo";
const PROPOSAL_DISCLAIMER =
  "This proposal is based on the information you provided and is subject to final underwriting and review.";

const WORKFLOW_STEPS = [
  "Paste assessment JSON",
  "Review options",
  "Finalize quotation and create link",
  "Client review and approval",
  "Set calendar booking via Google Calendar",
  "Complete"
];

const PIPELINE_COLUMNS = [
  { id: "new_leads", label: "New leads" },
  { id: "sent_link", label: "Sent link" },
  { id: "agreed", label: "Agreed" },
  { id: "booking_sent", label: "Sent booking calendar" },
  { id: "done_call", label: "Done call" },
  { id: "new_business", label: "New business" }
];

const sampleRawAssessment = {
  submittedAt: new Date().toISOString(),
  currentScreen: "complete",
  completedModules: ["foundation", "protection", "quote"],
  activeModuleId: "quote",
  answers: {
    stage: "parent",
    income_stability: "stable",
    savings_habit: "irregular",
    emergencyFund: 2,
    protection: ["hmo"],
    dependents: ["spouse", "child"],
    priorities: ["family_protection"],
    confidence: "medium"
  },
  quoteData: {
    age: 37,
    gender: "male",
    goal: "family protection",
    budget: "PHP 1,500-3,000 / month",
    name: "Maria Santos",
    phone: "+63 917 555 0123",
    email: "maria@example.com",
    consent: true,
    birthYear: 1989
  },
  scoreData: {
    score: 58,
    breakdown: { cashflow: 15, emergency: 10, protection: 18, goals: 15 },
    persona: { title: "The Builder", emoji: "", subtitle: "You are making steady progress and can strengthen your protection base." },
    scoreColor: "gold",
    pressurePoints: [
      {
        title: "Life protection gap",
        icon: "shield",
        status: "attention",
        bgClass: "",
        badgeClass: "",
        desc: "Dependents are listed, but no life insurance coverage was indicated.",
        shortText: "Your income may support people beyond yourself.",
        answerPreview: "Spouse/Partner, Children",
        answerTopic: "family support",
        detail: "A family backup layer may still need review.",
        whyItMatters: "A backup plan helps protect essential bills if income is interrupted."
      }
    ],
    cta: {
      headline: "You are building a solid foundation",
      hook: "Let us close the protection gap with a practical next step.",
      buttonText: "Review my options",
      icon: "shield"
    }
  },
  moduleTimings: { foundation: "42s", protection: "61s", quote: "38s" }
};

function getDateOtpCode() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${month}${day}`;
}

function formatDate(value) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatRelative(value) {
  if (!value) return "Not yet";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return formatDate(value);
}

function formatCurrency(value, currency = "PHP") {
  const amount = Number(value);
  if (Number.isNaN(amount)) return "For review";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

const PAYMENT_MODE_DIVISORS = {
  annual: 1,
  "semi-annual": 2,
  quarterly: 4,
  monthly: 12
};

const PAYMENT_MODE_LABELS = {
  annual: "Annual",
  "semi-annual": "Semi-annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
  single: "Single"
};

function getAnnualPremium(product) {
  return product.payment_structure.minimum_annual_premium || product.example_quotation?.annual_premium || product.payment_structure.min_premium_estimate * 12;
}

function getPaymentSchedule(product) {
  const annualPremium = getAnnualPremium(product);
  return (product.payment_structure.modal_options || ["annual"]).map((mode) => ({
    mode,
    label: PAYMENT_MODE_LABELS[mode] || mode,
    amount: annualPremium / (PAYMENT_MODE_DIVISORS[mode] || 1)
  }));
}

function getCoverageSnapshot(product, selectedRiderTypes = []) {
  const baseSumAssured = product.default_coverage?.sum_assured || product.example_quotation?.base_sum_assured || 0;
  const selectedRiders = (product.available_riders || [])
    .filter((rider) => selectedRiderTypes.includes(rider.rider_type))
    .map((rider) => ({
      rider_name: rider.rider_name,
      rider_type: rider.rider_type,
      sum_assured_type: rider.sum_assured_type || "fixed",
      default_sum_assured: rider.default_sum_assured || (rider.sum_assured_type === "accelerated" ? baseSumAssured : 0),
      sum_assured_label: rider.sum_assured_label || "Rider coverage for review"
    }));

  return {
    base_sum_assured: baseSumAssured,
    base_sum_assured_label: product.default_coverage?.label || "Default sum assured",
    base_sum_assured_basis: product.default_coverage?.basis || "base_sum_assured",
    annual_premium: getAnnualPremium(product),
    payment_schedule: getPaymentSchedule(product),
    riders: selectedRiders
  };
}

function getProposalCoverageSnapshot(product, proposal) {
  return proposal.coverage_snapshot || getCoverageSnapshot(product, proposal.selected_riders || []);
}

function makeRoute(name, params = {}) {
  return { name, ...params };
}

function parseRoute() {
  const path = window.location.pathname;
  const proposalMatch = path.match(/^\/proposal\/([^/]+)$/);
  if (proposalMatch) return makeRoute("public-proposal", { token: proposalMatch[1] });
  return makeRoute("dashboard");
}

function copyText(value) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.resolve();
}

function getProduct(productId) {
  return products.find((product) => product.product_id === productId) || null;
}

function buildProposalUrl(token) {
  return `${window.location.origin}/proposal/${token}`;
}

function getLeadMatchData(lead) {
  const matchingInput = adaptRawAssessmentToMatchInput(lead.raw_assessment);
  validateMatchingInput(matchingInput);
  validateProducts(products);
  validatePivotRules(pivotRules);
  return {
    matchingInput,
    results: getRecommendations(matchingInput, products, pivotRules)
  };
}

function getThreatReasoning(threats = []) {
  return threats
    .map((threat) => threat.desc || threat.title)
    .filter(Boolean)
    .map((text) => `Assessment gap: ${text}`);
}

function getProposalReasoning(recommendation, threats = []) {
  return [...new Set([...recommendation.reasoning, ...getThreatReasoning(threats)])];
}

function latestProposalForLead(proposals, leadId) {
  return proposals
    .filter((proposal) => proposal.lead_id === leadId)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0] || null;
}

function getPipelineStage(lead, proposal) {
  if (lead?.new_business_at) return "new_business";
  if (lead?.call_done_at) return "done_call";
  if (proposal?.booking_sent_at) return "booking_sent";
  if (proposal?.status === "accepted") return "agreed";
  if (proposal?.sent_at) return "sent_link";
  return "new_leads";
}

function getWorkflowStepForState(lead, proposal) {
  if (lead?.new_business_at || lead?.call_done_at) return 6;
  if (proposal?.booking_sent_at || proposal?.status === "accepted") return 5;
  if (proposal?.sent_at || proposal?.viewed_at) return 4;
  if (proposal) return 3;
  return 2;
}

function routeForContact(lead, proposal) {
  const stage = getPipelineStage(lead, proposal);
  if (!proposal) return makeRoute("options", { leadId: lead.lead_id });
  if (stage === "agreed" || stage === "booking_sent") return makeRoute("booking", { proposalId: proposal.proposal_id });
  if (stage === "done_call" || stage === "new_business") return makeRoute("complete", { leadId: lead.lead_id });
  return makeRoute("proposal-preview", { proposalId: proposal.proposal_id });
}

function buildCalendarUrl({ lead, product, startDateTime, durationMinutes, meetingLocation, notes }) {
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const formatCalendarDate = (date) => date.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const details = [
    `Client: ${lead.name}`,
    product ? `Product: ${product.product_name}` : "",
    notes || "Review proposal, answer questions, and confirm next manual steps."
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Insurance proposal review - ${lead.name}`,
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
    details,
    location: meetingLocation || "Google Meet"
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function WorkflowStepper({ currentStep }) {
  return (
    <nav className="mb-6 rounded-lg border border-line bg-white p-4 shadow-sm" aria-label="Lead workflow">
      <div className="grid gap-3 md:grid-cols-6">
        {WORKFLOW_STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          return (
            <div key={step} className={`rounded-md border p-3 ${isCurrent ? "border-forest bg-forest/5" : isComplete ? "border-forest/30 bg-mist" : "border-line bg-white"}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isComplete || isCurrent ? "bg-forest text-white" : "bg-mist text-slate-500"}`}>
                {isComplete ? <CheckCircle2 size={15} /> : stepNumber}
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-ink">{step}</p>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function LoginGate({ onAuthenticated }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const inputRefs = useRef([]);

  function submitCode(nextDigits) {
    const code = nextDigits.join("");
    if (code.length !== 4) return;

    if (code === getDateOtpCode()) {
      setError("");
      onAuthenticated();
      return;
    }

    setError("The code entered does not match today's access code.");
  }

  function updateDigit(index, value) {
    const numericValue = value.replace(/\D/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = numericValue;
    setDigits(nextDigits);
    setError("");

    if (numericValue && index < inputRefs.current.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    submitCode(nextDigits);
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    const nextDigits = Array.from({ length: 4 }, (_, index) => pastedDigits[index] || "");
    setDigits(nextDigits);
    setError("");

    const nextEmptyIndex = nextDigits.findIndex((digit) => !digit);
    inputRefs.current[nextEmptyIndex === -1 ? 3 : nextEmptyIndex]?.focus();
    submitCode(nextDigits);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5 py-10">
      <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-forest text-white">
          <LockKeyhole size={21} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-ink">Advisor Access</h1>
        <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="otp-0">
          Provide the code sent to your email.
        </label>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              id={`otp-${index}`}
              type="password"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              aria-label={`Code digit ${index + 1}`}
              className="otp-digit h-14 rounded-md border border-line bg-mist text-center text-2xl font-semibold text-ink outline-none focus:border-forest focus:bg-white focus:ring-2 focus:ring-forest/20"
            />
          ))}
        </div>
        {error && <p className="mt-3 text-sm font-medium text-coral">{error}</p>}
      </section>
    </main>
  );
}

function AppShell({ children, onNavigate }) {
  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => onNavigate(makeRoute("dashboard"))} className="flex items-center gap-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-forest text-white">
              <ShieldCheck size={20} />
            </span>
            <span>
              <span className="block text-lg font-semibold text-ink">Proposal Workspace</span>
              <span className="block text-sm text-slate-500">Lead intake, product review, and client confirmation</span>
            </span>
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate(makeRoute("product-catalog"))}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-forest"
            >
              <ReceiptText size={17} />
              Products
            </button>
            <button
              type="button"
              onClick={() => onNavigate(makeRoute("intake"))}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90"
            >
              <Plus size={17} />
              New Lead
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
    </main>
  );
}

function Dashboard({ onNavigate, refreshKey }) {
  const leads = useMemo(() => getLeads(), [refreshKey]);
  const proposals = useMemo(() => getProposals(), [refreshKey]);

  const contacts = leads.map((lead) => {
    const proposal = latestProposalForLead(proposals, lead.lead_id);
    return {
      lead,
      proposal,
      stage: getPipelineStage(lead, proposal)
    };
  });

  return (
    <section>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Contacts Pipeline</h1>
          <p className="text-sm text-slate-500">Click a contact to continue from its current workflow step.</p>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 text-center shadow-sm">
          <ClipboardList className="mx-auto text-forest" size={34} />
          <h2 className="mt-4 text-xl font-semibold text-ink">No leads yet</h2>
          <p className="mt-2 text-sm text-slate-500">Paste a raw assessment JSON export to start the proposal workflow.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {PIPELINE_COLUMNS.map((column) => {
            const columnContacts = contacts.filter((contact) => contact.stage === column.id);
            return (
              <section key={column.id} className="min-h-[260px] rounded-lg border border-line bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">{column.label}</h2>
                  <span className="rounded-full bg-mist px-2 py-1 text-xs font-semibold text-slate-500">{columnContacts.length}</span>
                </div>
                <div className="space-y-3">
                  {columnContacts.map(({ lead, proposal }) => {
                    const product = proposal ? getProduct(proposal.selected_product_id) : null;
                    const persona = lead.raw_assessment.scoreData?.persona?.title || "Unassigned";
                    return (
                      <button
                        key={lead.lead_id}
                        type="button"
                        onClick={() => onNavigate(routeForContact(lead, proposal))}
                        className="block w-full rounded-md border border-line bg-mist p-3 text-left hover:border-forest hover:bg-white"
                      >
                        <p className="font-semibold text-ink">{lead.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{persona}</p>
                        <p className="mt-2 text-xs font-medium text-slate-600">{product?.product_name || "Options pending"}</p>
                        {proposal?.viewed_at && <p className="mt-2 text-xs text-slate-500">Viewed {formatRelative(proposal.viewed_at)}</p>}
                        {proposal?.booking_sent_at && <p className="mt-2 text-xs text-slate-500">Booking sent {formatRelative(proposal.booking_sent_at)}</p>}
                      </button>
                    );
                  })}
                  {columnContacts.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-xs text-slate-500">No contacts</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function IntakeScreen({ onNavigate, onDataChanged }) {
  const [jsonText, setJsonText] = useState(JSON.stringify(sampleRawAssessment, null, 2));
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError("Paste a valid JSON object before continuing.");
      return;
    }

    const errors = validateRawAssessment(parsed);
    if (errors.length > 0) {
      setError(errors.join(" "));
      return;
    }

    const lead = saveLead(createLeadFromRawAssessment(parsed, AGENT_ID));
    onDataChanged();
    onNavigate(makeRoute("options", { leadId: lead.lead_id }));
  }

  return (
    <section>
      <WorkflowStepper currentStep={1} />
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink">Paste Assessment JSON</h1>
        <p className="text-sm text-slate-500">Use the raw assessment app export. The original payload is stored as-is on the lead record.</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <label className="block text-sm font-semibold text-ink" htmlFor="assessment-json">
          Paste Assessment JSON
        </label>
        <textarea
          id="assessment-json"
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          className="mt-3 min-h-[420px] w-full resize-y rounded-md border border-line bg-mist p-4 font-mono text-sm leading-6 text-ink outline-none focus:border-forest focus:bg-white focus:ring-2 focus:ring-forest/20"
          spellCheck={false}
        />
        {error && (
          <div className="mt-4 flex gap-3 rounded-md border border-coral/30 bg-coral/5 p-3 text-sm text-coral">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p>{error}</p>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90">
            <Clipboard size={17} />
            Create Lead
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductCatalogScreen({ onNavigate }) {
  return (
    <section>
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-forest">Product library</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Product Specifications</h1>
        <p className="mt-1 text-sm text-slate-500">Advisor-only product overview based on the configured product data.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <article key={product.product_id} className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{product.product_type}</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">{product.product_name}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{product.tagline}</p>
            {product.needs_review && (
              <p className="mt-3 rounded-md border border-gold/60 bg-gold/10 px-3 py-2 text-xs font-semibold text-ink">Needs product spec review</p>
            )}
            <div className="mt-4 rounded-md border border-line bg-mist p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Minimum annual premium</p>
              <p className="mt-1 text-lg font-semibold text-forest">{formatCurrency(getAnnualPremium(product), product.payment_structure.currency)}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(makeRoute("product-detail", { productId: product.product_id }))}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-forest"
            >
              <ReceiptText size={16} />
              Review Product
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductDetailScreen({ productId, onNavigate }) {
  const product = getProduct(productId);

  if (!product) {
    return <MissingState title="Product not found" onNavigate={onNavigate} />;
  }

  const paymentSchedule = getPaymentSchedule(product);
  const example = product.example_quotation || {};

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-forest">Product specification</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">{product.product_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{product.product_type} - {product.coverage_duration.replaceAll("_", " ")}</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate(makeRoute("product-catalog"))}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-forest"
        >
          Back to Products
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="rounded-lg border border-line bg-white p-6 shadow-sm">
          {product.needs_review && (
            <div className="mb-5 rounded-md border border-gold/60 bg-gold/10 p-4 text-sm leading-6 text-slate-700">
              <span className="font-semibold text-ink">Needs review: </span>
              {product.review_note}
            </div>
          )}
          <p className="text-lg leading-7 text-slate-700">{product.product_description || product.tagline}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-line bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Minimum annual premium</p>
              <p className="mt-2 text-2xl font-semibold text-forest">{formatCurrency(getAnnualPremium(product), product.payment_structure.currency)}</p>
            </div>
            <div className="rounded-md border border-line bg-mist p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Default sum coverage</p>
              <p className="mt-2 text-2xl font-semibold text-forest">{formatCurrency(product.default_coverage?.sum_assured, product.payment_structure.currency)}</p>
              <p className="mt-1 text-xs text-slate-500">{product.default_coverage?.label}</p>
            </div>
          </div>

          <section className="mt-6">
            <h2 className="text-lg font-semibold text-ink">Payment Modes</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {paymentSchedule.map((item) => (
                <div key={item.mode} className="rounded-md border border-line bg-white p-4">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-forest">{formatCurrency(item.amount, product.payment_structure.currency)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold text-ink">Example Quotation</h2>
            <div className="mt-3 rounded-md border border-line bg-mist p-4 text-sm leading-6 text-slate-700">
              <p><span className="font-semibold text-ink">Profile:</span> {example.profile || "For advisor review"}</p>
              <p><span className="font-semibold text-ink">Base coverage:</span> {formatCurrency(example.base_sum_assured || product.default_coverage?.sum_assured, product.payment_structure.currency)}</p>
              <p><span className="font-semibold text-ink">Annual premium:</span> {formatCurrency(example.annual_premium || getAnnualPremium(product), product.payment_structure.currency)}</p>
              <p className="mt-2 text-xs text-slate-500">{example.notes}</p>
            </div>
          </section>
        </article>

        <aside className="h-fit rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Riders Offered</h2>
          <div className="mt-4 space-y-3">
            {(product.available_riders || []).map((rider) => (
              <div key={rider.rider_type} className="rounded-md border border-line bg-mist p-4">
                <p className="font-semibold text-ink">{rider.rider_name}</p>
                <p className="mt-1 text-sm text-slate-600">{rider.sum_assured_label}</p>
                <p className="mt-2 text-sm font-semibold text-forest">
                  {rider.sum_assured_type === "accelerated" ? "Accelerated from base coverage" : "Fixed rider coverage"}: {formatCurrency(rider.default_sum_assured, product.payment_structure.currency)}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function ProductOptionsScreen({ leadId, onNavigate, onDataChanged }) {
  const lead = getLead(leadId);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedRiders, setSelectedRiders] = useState([]);

  if (!lead) {
    return <MissingState title="Lead not found" onNavigate={onNavigate} />;
  }

  const { matchingInput, results } = getLeadMatchData(lead);
  const raw = lead.raw_assessment;
  const threats = raw.scoreData?.pressurePoints || raw.scoreData?.threats || [];
  const selectedRecommendation = results.recommendations.find((recommendation) => recommendation.product_id === selectedProductId);

  function toggleRider(riderType) {
    setSelectedRiders((current) => {
      if (current.includes(riderType)) return current.filter((item) => item !== riderType);
      if (current.length >= 2) return current;
      return [...current, riderType];
    });
  }

  function generateProposal() {
    if (!selectedRecommendation) return;
    const selectedProduct = getProduct(selectedRecommendation.product_id);
    if (!selectedProduct) return;
    const proposal = saveProposal({
      proposal_id: crypto.randomUUID(),
      lead_id: lead.lead_id,
      agent_id: AGENT_ID,
      selected_product_id: selectedRecommendation.product_id,
      selected_riders: selectedRiders,
      coverage_snapshot: getCoverageSnapshot(selectedProduct, selectedRiders),
      match_reasoning_snapshot: getProposalReasoning(selectedRecommendation, threats),
      status: "draft",
      created_at: new Date().toISOString(),
      sent_at: null,
      viewed_at: null,
      accepted_at: null,
      client_acceptance: {
        checkbox_confirmed: false,
        confirmed_at: null,
        ip_or_session_ref: null
      },
      public_share_token: createPublicShareToken()
    });
    onDataChanged();
    onNavigate(makeRoute("proposal-preview", { proposalId: proposal.proposal_id }));
  }

  return (
    <section>
      <WorkflowStepper currentStep={2} />
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-forest">Product options</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">{lead.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Age {lead.age} - {lead.email || lead.phone}
          </p>
        </div>
        <aside className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="text-forest" size={18} />
            <p className="font-semibold text-ink">
              {[raw.scoreData?.persona?.emoji, raw.scoreData?.persona?.title || matchingInput.assessment_result.persona].filter(Boolean).join(" ")}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-600">{raw.scoreData?.persona?.subtitle}</p>
          <p className="mt-3 text-sm font-semibold text-ink">Score: {raw.scoreData?.score ?? matchingInput.assessment_result.total_score}</p>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          {results.recommendations.length === 0 && (
            <div className="rounded-lg border border-gold/60 bg-white p-6 shadow-sm">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-gold" size={22} />
                <div>
                  <h2 className="text-lg font-semibold text-ink">No eligible products within stated budget</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The current product set does not include an option that fits this client's budget comfort. Review the budget with the client before generating a proposal.
                  </p>
                </div>
              </div>
            </div>
          )}
          {results.recommendations.map((recommendation) => {
            const isSelected = selectedProductId === recommendation.product_id;
            const product = getProduct(recommendation.product_id);
            const paymentSchedule = product ? getPaymentSchedule(product) : [];
            return (
              <article key={recommendation.product_id} className={`rounded-lg border bg-white p-5 shadow-sm ${isSelected ? "border-forest ring-2 ring-forest/20" : "border-line"}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{recommendation.product_type.replaceAll("_", " ")}</p>
                    <h2 className="mt-2 text-xl font-semibold text-ink">{recommendation.product_name}</h2>
                    <p className="mt-1 text-slate-600">{recommendation.tagline}</p>
                    {product && (
                      <button
                        type="button"
                        onClick={() => onNavigate(makeRoute("product-detail", { productId: product.product_id }))}
                        className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-forest"
                      >
                        <ReceiptText size={15} />
                        Product info
                      </button>
                    )}
                  </div>
                  <div className="rounded-md border border-line bg-mist px-3 py-2 text-right">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Match score</p>
                    <p className="text-xl font-semibold text-forest">{recommendation.match_score}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-ink">Reasoning</p>
                    <ul className="space-y-2">
                      {getProposalReasoning(recommendation, threats).map((reason) => (
                        <li key={reason} className="flex gap-2 text-sm leading-6 text-slate-700">
                          <BadgeCheck className="mt-1 shrink-0 text-forest" size={16} />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-ink">Riders available</p>
                    <div className="space-y-2">
                      {recommendation.available_riders.length === 0 && <p className="text-sm text-slate-500">No riders listed.</p>}
                      {recommendation.available_riders.map((rider) => (
                        <label key={rider.rider_type} className="flex items-center gap-3 rounded-md border border-line bg-mist px-3 py-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={selectedProductId === recommendation.product_id && selectedRiders.includes(rider.rider_type)}
                            disabled={selectedProductId !== recommendation.product_id || (!selectedRiders.includes(rider.rider_type) && selectedRiders.length >= 2)}
                            onChange={() => toggleRider(rider.rider_type)}
                            className="h-4 w-4 accent-forest"
                          />
                          {rider.rider_name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {product && (
                  <div className="mt-5 rounded-md border border-line bg-mist p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Minimum annual premium</p>
                        <p className="mt-1 text-lg font-semibold text-forest">{formatCurrency(getAnnualPremium(product), product.payment_structure.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Default coverage</p>
                        <p className="mt-1 text-lg font-semibold text-forest">{formatCurrency(product.default_coverage?.sum_assured, product.payment_structure.currency)}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {paymentSchedule.map((item) => (
                        <div key={item.mode} className="rounded-md bg-white px-3 py-2">
                          <p className="text-xs text-slate-500">{item.label}</p>
                          <p className="text-sm font-semibold text-ink">{formatCurrency(item.amount, product.payment_structure.currency)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recommendation.compliance_flags.length > 0 && (
                  <div className="mt-4 rounded-md border border-gold/60 bg-gold/10 p-3 text-sm text-slate-700">
                    <span className="font-semibold text-ink">Advisor note: </span>
                    {recommendation.compliance_flags.join(" ")}
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductId(recommendation.product_id);
                      setSelectedRiders([]);
                    }}
                    className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold ${isSelected ? "bg-forest text-white" : "border border-line bg-white text-ink hover:border-forest"}`}
                  >
                    <Radio size={16} />
                    {isSelected ? "Selected as Final Proposal" : "Select as Final Proposal"}
                  </button>
                </div>
              </article>
            );
          })}
          <div className="sticky bottom-0 flex justify-end border-t border-line bg-mist/95 py-4">
            <button
              type="button"
              disabled={!selectedRecommendation}
              onClick={generateProposal}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <FileText size={17} />
              Generate Client Proposal
            </button>
          </div>
        </div>

        <aside className="h-fit rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="text-forest" />
            <h2 className="text-lg font-semibold text-ink">Assessment Threats</h2>
          </div>
          <div className="mt-4 space-y-3">
            {threats.map((threat) => (
              <div key={threat.title} className="rounded-md border border-line bg-mist p-4">
                <p className="text-sm font-semibold text-ink">{threat.title}</p>
                <p className="mt-1 text-sm text-slate-600">{threat.desc}</p>
              </div>
            ))}
            {threats.length === 0 && <p className="text-sm text-slate-500">No threat records were included in the raw payload.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function ProposalDocument({ lead, proposal, clientView = false }) {
  const product = getProduct(proposal.selected_product_id);
  const raw = lead.raw_assessment;
  const selectedRiders = (product?.available_riders || []).filter((rider) => proposal.selected_riders.includes(rider.rider_type));

  if (!product) return null;

  const coverage = getProposalCoverageSnapshot(product, proposal);

  return (
    <article className="rounded-lg border border-line bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-forest">Client proposal</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink">{raw.scoreData?.cta?.headline || "Your financial foundation proposal"}</h1>
      <p className="mt-3 text-lg text-slate-600">
        {lead.name}, {raw.scoreData?.persona?.subtitle || "this proposal is prepared from the assessment details you provided."}
      </p>

      <section className="mt-6 rounded-lg border border-line bg-mist p-5">
        <p className="text-sm font-semibold text-slate-500">Selected solution</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{product.product_name}</h2>
        <p className="mt-1 text-slate-600">{product.tagline}</p>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-white p-5">
        <h3 className="text-lg font-semibold text-ink">Coverage and Premium Summary</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-line bg-mist p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{coverage.base_sum_assured_label}</p>
            <p className="mt-2 text-2xl font-semibold text-forest">{formatCurrency(coverage.base_sum_assured, product.payment_structure.currency)}</p>
          </div>
          <div className="rounded-md border border-line bg-mist p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Minimum annual premium</p>
            <p className="mt-2 text-2xl font-semibold text-forest">{formatCurrency(coverage.annual_premium, product.payment_structure.currency)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {coverage.payment_schedule.map((item) => (
            <div key={item.mode} className="rounded-md border border-line bg-mist px-3 py-2">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="text-sm font-semibold text-ink">{formatCurrency(item.amount, product.payment_structure.currency)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="text-lg font-semibold text-ink">Why this fits you</h3>
          <ul className="mt-3 space-y-2">
            {proposal.match_reasoning_snapshot.map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-6 text-slate-700">
                <BadgeCheck className="mt-1 shrink-0 text-forest" size={16} />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-lg font-semibold text-ink">Key benefits</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {product.key_benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </section>
      </div>

      {selectedRiders.length > 0 && (
        <section className="mt-6">
          <h3 className="text-lg font-semibold text-ink">Optional add-ons included for review</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {coverage.riders.map((rider) => (
              <div key={rider.rider_type} className="rounded-md border border-line bg-mist p-4">
                <p className="font-semibold text-ink">{rider.rider_name}</p>
                <p className="mt-1 text-sm text-slate-600">{rider.sum_assured_label}</p>
                <p className="mt-2 text-sm font-semibold text-forest">
                  {rider.sum_assured_type === "accelerated" ? "Accelerated" : "Fixed"} rider sum assured: {formatCurrency(rider.default_sum_assured, product.payment_structure.currency)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 rounded-md border border-gold/60 bg-gold/10 p-4 text-sm leading-6 text-slate-700">
        <span className="font-semibold text-ink">Important: </span>
        {PROPOSAL_DISCLAIMER} {clientView && "This confirms your interest - it is not a signed policy contract."}
      </div>
    </article>
  );
}

function ProposalPreviewScreen({ proposalId, onNavigate, onDataChanged }) {
  const [proposal, setProposal] = useState(() => getProposal(proposalId));
  const lead = proposal ? getLead(proposal.lead_id) : null;
  const [copied, setCopied] = useState(false);

  if (!proposal || !lead) {
    return <MissingState title="Proposal not found" onNavigate={onNavigate} />;
  }

  const shareUrl = buildProposalUrl(proposal.public_share_token);

  function generateLink() {
    const now = new Date().toISOString();
    const updated = updateProposal(proposal.proposal_id, (current) => ({
      ...current,
      status: current.status === "draft" ? "sent" : current.status,
      sent_at: current.sent_at || now
    }));
    setProposal(updated);
    onDataChanged();
  }

  async function copyLink() {
    await copyText(shareUrl);
    setCopied(true);
  }

  return (
    <section>
      <WorkflowStepper currentStep={getWorkflowStepForState(lead, proposal)} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-forest">Proposal preview</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">{lead.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Status: {proposal.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generateLink}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90"
          >
            <Send size={16} />
            Generate Shareable Link
          </button>
          {proposal.sent_at && (
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-forest"
            >
              <Link size={16} />
              {copied ? "Copied" : "Copy Link"}
            </button>
          )}
          {proposal.status === "accepted" && (
            <button
              type="button"
              onClick={() => onNavigate(makeRoute("booking", { proposalId: proposal.proposal_id }))}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90"
            >
              <CalendarDays size={16} />
              Set Calendar Booking
            </button>
          )}
        </div>
      </div>

      {proposal.sent_at && (
        <div className="mb-5 rounded-md border border-line bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p className="font-semibold text-ink">Public URL</p>
          <p className="mt-1 break-all">{shareUrl}</p>
        </div>
      )}

      <ProposalDocument lead={lead} proposal={proposal} />
    </section>
  );
}

function PublicProposalScreen({ token, onDataChanged }) {
  const [proposal, setProposal] = useState(() => getProposalByToken(token));
  const [checked, setChecked] = useState(false);
  const lead = proposal ? getLead(proposal.lead_id) : null;

  useEffect(() => {
    if (!proposal || proposal.viewed_at) return;
    const viewedAt = new Date().toISOString();
    const updated = updateProposal(proposal.proposal_id, (current) => ({
      ...current,
      status: current.status === "sent" ? "viewed" : current.status,
      viewed_at: viewedAt
    }));
    setProposal(updated);
    onDataChanged();
  }, [proposal, onDataChanged]);

  if (!proposal || !lead) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-5">
        <section className="max-w-md rounded-lg border border-line bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-coral" size={30} />
          <h1 className="mt-3 text-xl font-semibold text-ink">Proposal not found</h1>
          <p className="mt-2 text-sm text-slate-500">Check the link with your advisor.</p>
        </section>
      </main>
    );
  }

  const accepted = proposal.status === "accepted";

  function confirmInterest() {
    if (!checked || accepted) return;
    const now = new Date().toISOString();
    const updated = updateProposal(proposal.proposal_id, (current) => ({
      ...current,
      status: "accepted",
      accepted_at: now,
      client_acceptance: {
        checkbox_confirmed: true,
        confirmed_at: now,
        ip_or_session_ref: `browser-session:${current.public_share_token.slice(0, 8)}`
      }
    }));
    setProposal(updated);
    onDataChanged();
  }

  return (
    <main className="min-h-screen bg-mist px-5 py-8">
      <div className="mx-auto max-w-4xl">
        <ProposalDocument lead={lead} proposal={proposal} clientView />
        <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-sm">
          {accepted ? (
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-forest" size={22} />
              <div>
                <h2 className="font-semibold text-ink">Proposal Accepted on {formatDate(proposal.accepted_at)}</h2>
                <p className="mt-1 text-sm text-slate-600">Thanks, {lead.name}! Your agent has been notified and will follow up with you on the next steps.</p>
              </div>
            </div>
          ) : (
            <>
              <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 h-4 w-4 accent-forest" />
                <span>I have reviewed this proposal and confirm I'd like to proceed. This confirms my interest - it is not a signed policy contract.</span>
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!checked}
                  onClick={confirmInterest}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <CheckCircle2 size={17} />
                  Confirm
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function BookingScreen({ proposalId, onNavigate, onDataChanged }) {
  const [proposal, setProposal] = useState(() => getProposal(proposalId));
  const lead = proposal ? getLead(proposal.lead_id) : null;
  const product = proposal ? getProduct(proposal.selected_product_id) : null;
  const [startDateTime, setStartDateTime] = useState(() => proposal?.booking?.start_datetime || "");
  const [durationMinutes, setDurationMinutes] = useState(() => proposal?.booking?.duration_minutes || 45);
  const [meetingLocation, setMeetingLocation] = useState(() => proposal?.booking?.meeting_location || "Google Meet");
  const [notes, setNotes] = useState(() => proposal?.booking?.notes || "Proposal review and next steps.");

  if (!proposal || !lead) {
    return <MissingState title="Booking record not found" onNavigate={onNavigate} />;
  }

  const calendarUrl = startDateTime
    ? buildCalendarUrl({ lead, product, startDateTime, durationMinutes: Number(durationMinutes), meetingLocation, notes })
    : "";

  function saveBooking(sent = false) {
    if (!startDateTime) return;
    const now = new Date().toISOString();
    const updated = updateProposal(proposal.proposal_id, (current) => ({
      ...current,
      booking: {
        start_datetime: startDateTime,
        duration_minutes: Number(durationMinutes),
        meeting_location: meetingLocation,
        notes,
        google_calendar_url: calendarUrl
      },
      booking_sent_at: sent ? current.booking_sent_at || now : current.booking_sent_at || null
    }));
    setProposal(updated);
    onDataChanged();
  }

  function openCalendar() {
    saveBooking(true);
    window.open(calendarUrl, "_blank", "noopener,noreferrer");
  }

  function markCallDone() {
    const now = new Date().toISOString();
    updateLead(lead.lead_id, (current) => ({
      ...current,
      call_done_at: current.call_done_at || now
    }));
    onDataChanged();
    onNavigate(makeRoute("complete", { leadId: lead.lead_id }));
  }

  return (
    <section>
      <WorkflowStepper currentStep={5} />
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-forest">Calendar booking</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{lead.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{product?.product_name || "Selected proposal"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">
              Meeting date and time
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(event) => setStartDateTime(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-line bg-mist px-3 text-sm outline-none focus:border-forest focus:bg-white focus:ring-2 focus:ring-forest/20"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Duration
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                className="mt-2 h-11 w-full rounded-md border border-line bg-mist px-3 text-sm outline-none focus:border-forest focus:bg-white focus:ring-2 focus:ring-forest/20"
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-ink">
            Location
            <input
              type="text"
              value={meetingLocation}
              onChange={(event) => setMeetingLocation(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-line bg-mist px-3 text-sm outline-none focus:border-forest focus:bg-white focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <label className="mt-4 block text-sm font-semibold text-ink">
            Calendar notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-2 min-h-28 w-full rounded-md border border-line bg-mist p-3 text-sm outline-none focus:border-forest focus:bg-white focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={!startDateTime}
              onClick={() => saveBooking(false)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-forest disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Save Booking Draft
            </button>
            <button
              type="button"
              disabled={!startDateTime}
              onClick={openCalendar}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ExternalLink size={16} />
              Open Google Calendar
            </button>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Booking status</h2>
          <p className="mt-2 text-sm text-slate-600">
            {proposal.booking_sent_at ? `Calendar booking sent ${formatRelative(proposal.booking_sent_at)}.` : "Calendar booking has not been sent yet."}
          </p>
          {proposal.booking?.google_calendar_url && <p className="mt-3 break-all text-xs text-slate-500">{proposal.booking.google_calendar_url}</p>}
          <button
            type="button"
            disabled={!proposal.booking_sent_at}
            onClick={markCallDone}
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <PhoneCall size={16} />
            Mark Call Done
          </button>
        </aside>
      </div>
    </section>
  );
}

function CompleteScreen({ leadId, onNavigate, onDataChanged }) {
  const lead = getLead(leadId);
  const proposal = lead ? latestProposalForLead(getProposals(), lead.lead_id) : null;
  const product = proposal ? getProduct(proposal.selected_product_id) : null;

  if (!lead) {
    return <MissingState title="Contact not found" onNavigate={onNavigate} />;
  }

  function markNewBusiness() {
    const now = new Date().toISOString();
    updateLead(lead.lead_id, (current) => ({
      ...current,
      new_business_at: current.new_business_at || now
    }));
    onDataChanged();
    onNavigate(makeRoute("dashboard"));
  }

  return (
    <section>
      <WorkflowStepper currentStep={6} />
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <CheckCircle2 className="text-forest" size={30} />
        <h1 className="mt-4 text-2xl font-semibold text-ink">Workflow Complete</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {lead.name} has completed the proposal and call workflow. Move this contact to new business when they are ready for official insurance product registration.
        </p>
        <div className="mt-5 rounded-md border border-line bg-mist p-4 text-sm text-slate-700">
          <p><span className="font-semibold text-ink">Product:</span> {product?.product_name || "No product selected"}</p>
          <p><span className="font-semibold text-ink">Call done:</span> {formatDate(lead.call_done_at)}</p>
          <p><span className="font-semibold text-ink">New business:</span> {lead.new_business_at ? formatDate(lead.new_business_at) : "Not moved yet"}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={markNewBusiness}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90"
          >
            Move to New Business
          </button>
          <button
            type="button"
            onClick={() => onNavigate(makeRoute("dashboard"))}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-forest"
          >
            Back to Pipeline
          </button>
        </div>
      </div>
    </section>
  );
}

function MissingState({ title, onNavigate }) {
  return (
    <section className="rounded-lg border border-line bg-white p-8 text-center shadow-sm">
      <AlertTriangle className="mx-auto text-coral" size={30} />
      <h1 className="mt-3 text-xl font-semibold text-ink">{title}</h1>
      <button
        type="button"
        onClick={() => onNavigate(makeRoute("dashboard"))}
        className="mt-4 inline-flex h-10 items-center rounded-md bg-forest px-4 text-sm font-semibold text-white"
      >
        Back to dashboard
      </button>
    </section>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [route, setRoute] = useState(parseRoute);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleNavigate(nextRoute) {
    setRoute(nextRoute);
    window.history.pushState(null, "", nextRoute.name === "public-proposal" ? `/proposal/${nextRoute.token}` : "/");
  }

  function handleDataChanged() {
    setRefreshKey((value) => value + 1);
  }

  useEffect(() => {
    const handlePopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (route.name === "public-proposal") {
    return <PublicProposalScreen token={route.token} onDataChanged={handleDataChanged} />;
  }

  if (!authenticated) {
    return <LoginGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  let content;
  if (route.name === "intake") {
    content = <IntakeScreen onNavigate={handleNavigate} onDataChanged={handleDataChanged} />;
  } else if (route.name === "product-catalog") {
    content = <ProductCatalogScreen onNavigate={handleNavigate} />;
  } else if (route.name === "product-detail") {
    content = <ProductDetailScreen productId={route.productId} onNavigate={handleNavigate} />;
  } else if (route.name === "options") {
    content = <ProductOptionsScreen leadId={route.leadId} onNavigate={handleNavigate} onDataChanged={handleDataChanged} />;
  } else if (route.name === "proposal-preview") {
    content = <ProposalPreviewScreen proposalId={route.proposalId} onNavigate={handleNavigate} onDataChanged={handleDataChanged} />;
  } else if (route.name === "booking") {
    content = <BookingScreen proposalId={route.proposalId} onNavigate={handleNavigate} onDataChanged={handleDataChanged} />;
  } else if (route.name === "complete") {
    content = <CompleteScreen leadId={route.leadId} onNavigate={handleNavigate} onDataChanged={handleDataChanged} />;
  } else {
    content = <Dashboard onNavigate={handleNavigate} refreshKey={refreshKey} />;
  }

  return <AppShell onNavigate={handleNavigate}>{content}</AppShell>;
}
