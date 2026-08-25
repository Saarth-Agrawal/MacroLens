import { enrichAnalysisResult } from "../lib/resultExperience.ts";

export type ConfidenceLevel = "High" | "Medium" | "Low";
export type StatementKind = "Confirmed fact" | "Evidence-supported inference" | "Causal hypothesis" | "Unverified claim";
export type ClaimCategory = "Event" | "Cause" | "Consequence" | "Causal hypothesis";
export type EvidenceRole = "Supports" | "Contradicts" | "Adds context" | "Insufficient evidence";
export type SourceType = "Official / primary" | "Independent reporting" | "Data / analysis" | "Unrated web source";
export type NodeLayer = "Signal" | "Mechanism" | "Hidden dependency" | "Wider consequence" | "Relevance";

export type EvidenceSource = {
  id: string;
  title: string;
  publisher: string;
  date: string;
  url: string;
  sourceType: SourceType;
  relatedClaims: string[];
  evidenceRole: EvidenceRole;
  verificationDepth?: "full-text" | "headline-consensus" | "curated-review";
  excerpt?: string;
  excerptKind?: "verbatim" | "source-title";
  translationDisclosure?: string;
  limitations?: string[];
  note: string;
};

export type Claim = {
  id: string;
  text: string;
  category: ClaimCategory;
  kind: StatementKind;
  evidenceIds: string[];
  /** True only when this statement is part of the submitted headline itself. */
  isHeadlineClaim?: boolean;
};

export type CausalNode = {
  id: string;
  layer: NodeLayer;
  title: string;
  summary: string;
  kind: StatementKind;
  confidence: ConfidenceLevel;
  evidenceIds: string[];
  uncertainty: string;
};

export type CoreAnalysisResult = {
  id: string;
  mode: "curated" | "live";
  headline: string;
  detectedLanguage: "English" | "Hindi" | "Marathi";
  updated: string;
  shortFrame: string;
  translatedFrame?: { Hindi: string; Marathi: string };
  claims: Claim[];
  confirmed: string[];
  uncertain: string[];
  nodes: CausalNode[];
  whyItMatters: string[];
  winners: string[];
  losers: string[];
  stressTest: {
    challengingEvidence: string[];
    alternatives: string[];
    missingInformation: string[];
    changeConditions: string[];
  };
  confidence: { level: ConfidenceLevel; reasons: string[] };
  sources: EvidenceSource[];
  limitations: string[];
  aiAnalysis?: GeminiAnalysis;
};

export type EvidenceStatus = "Confirmed" | "Contested" | "Insufficient";
export type UserProfile = "General reader" | "Student" | "Salaried household" | "Small-business owner" | "Senior citizen";
export type ExposureType = "Direct" | "Indirect" | "No established exposure";
export type CouncilRole = "Verifier" | "Challenger" | "Mechanism Analyst" | "Relevance Analyst" | "Auditor";

export type BottomLine = {
  explanation: string;
  evidenceStatus: EvidenceStatus;
  keyImplication: string;
  keyUncertainty: string;
  independentSourceCount: number;
  lastUpdated: string;
  evidenceIds: string[];
  auditorApproved: boolean;
};

export type VisualStory = {
  whatHappened: { text: string; status: StatementKind; evidenceIds: string[] };
  why: { text: string; supportType: StatementKind; conditions: string; evidenceIds: string[] };
  whatNext: { text: string; timeHorizon: string; indicators: string[]; uncertainty: string; evidenceIds: string[] };
  whyYouCare: { text: string; userProfile: UserProfile; exposureType: ExposureType; conditions: string; timeHorizon: string; evidenceIds: string[] };
};

export type CouncilPerspective = {
  role: CouncilRole;
  purpose: string;
  position: string;
  reasoning: string;
  evidenceIds: string[];
  claimIds: string[];
  uncertainty: string;
  challenges: string;
  questionForUser: string;
  confidenceCategory: ConfidenceLevel;
};

export type CouncilDisagreement = {
  roles: [CouncilRole, CouncilRole];
  subject: string;
  evidenceByRole: Partial<Record<CouncilRole, string[]>>;
  concern: "Fact" | "Causation" | "Relevance" | "Time horizon";
};

export type CouncilSynthesis = {
  areasOfAgreement: string[];
  areasOfDisagreement: CouncilDisagreement[];
  unresolvedQuestions: string[];
  evidenceNeeded: string[];
};

export type GeminiAnalysis = {
  model: "gemini-3.5-flash-lite";
  framing: string;
  nodes: CausalNode[];
  perspectives: CouncilPerspective[];
  synthesis: CouncilSynthesis;
  disclosure: string;
};

export type ProfileRelevance = {
  profile: UserProfile;
  text: string;
  exposureType: ExposureType;
  conditions: string;
  timeHorizon: string;
  evidenceIds: string[];
};

export type ResultLayers = {
  selectedProfile: UserProfile;
  profileRelevance: Record<UserProfile, ProfileRelevance>;
  bottomLine: BottomLine;
  visualStory: VisualStory;
  councilPerspectives: CouncilPerspective[];
  councilSynthesis: CouncilSynthesis;
  reflectionPrompts: string[];
};

export type AnalysisResult = CoreAnalysisResult & ResultLayers;

const coreDemoCases: CoreAnalysisResult[] = [
  {
    id: "rbi-august-2026",
    mode: "curated",
    headline: "RBI keeps repo rate at 5.25% and retains neutral stance",
    detectedLanguage: "English",
    updated: "Evidence checked 21 August 2026",
    shortFrame: "The decision is confirmed. The effects are conditional: unchanged policy does not guarantee unchanged EMIs, and a neutral stance is not a promise to hold indefinitely.",
    translatedFrame: {
      Hindi: "आरबीआई ने रेपो दर 5.25% पर स्थिर रखी और तटस्थ रुख बरकरार रखा। इसका अर्थ यह नहीं कि ईएमआई तुरंत बदलेगी; आगे की दिशा महंगाई और बैंकों के दर-हस्तांतरण पर निर्भर है।",
      Marathi: "आरबीआयने रेपो दर ५.२५% वर कायम ठेवली आणि तटस्थ भूमिका राखली. याचा अर्थ ईएमआय लगेच बदलेल असा नाही; पुढील दिशा महागाई आणि बँकांच्या व्याजदर हस्तांतरणावर अवलंबून आहे.",
    },
    claims: [
      { id: "C1", text: "The Reserve Bank of India held the policy repo rate at 5.25%.", category: "Event", kind: "Confirmed fact", evidenceIds: ["S1", "S2"], isHeadlineClaim: true },
      { id: "C2", text: "The Monetary Policy Committee retained a neutral stance.", category: "Event", kind: "Confirmed fact", evidenceIds: ["S1", "S2"], isHeadlineClaim: true },
      { id: "C3", text: "The pause reflects a wait for clearer evidence about the inflation path.", category: "Cause", kind: "Evidence-supported inference", evidenceIds: ["S2", "S3"], isHeadlineClaim: false },
      { id: "C4", text: "The decision will keep every borrower’s EMI unchanged.", category: "Consequence", kind: "Unverified claim", evidenceIds: [], isHeadlineClaim: false },
    ],
    confirmed: [
      "The policy repo rate remained 5.25% after the August 2026 meeting.",
      "The committee’s stated stance remained neutral.",
      "Official policy documents and independent reporting agree on the decision.",
    ],
    uncertain: [
      "How quickly commercial banks will change lending or deposit rates.",
      "Whether broader inflation pressure will justify a future increase.",
      "The scale of the effect on household borrowing, investment and the rupee.",
    ],
    nodes: [
      {
        id: "signal",
        layer: "Signal",
        title: "Rate held at 5.25%",
        summary: "The MPC left its policy benchmark unchanged and retained a neutral stance.",
        kind: "Confirmed fact",
        confidence: "High",
        evidenceIds: ["S1", "S2"],
        uncertainty: "The decision is confirmed; its future duration is not.",
      },
      {
        id: "mechanism",
        layer: "Mechanism",
        title: "No fresh policy-rate impulse",
        summary: "Holding the benchmark avoids a new rate cut or increase, but banks still transmit earlier decisions on their own schedules.",
        kind: "Evidence-supported inference",
        confidence: "Medium",
        evidenceIds: ["S1"],
        uncertainty: "Loan reset dates, funding costs and bank pricing can produce different outcomes for different borrowers.",
      },
      {
        id: "dependency",
        layer: "Hidden dependency",
        title: "Inflation composition matters",
        summary: "A temporary oil or food shock can require a different response from persistent, broad-based inflation.",
        kind: "Causal hypothesis",
        confidence: "Medium",
        evidenceIds: ["S2", "S3"],
        uncertainty: "The next policy move depends on incoming inflation data, not the word ‘neutral’ alone.",
      },
      {
        id: "consequence",
        layer: "Wider consequence",
        title: "Borrowing relief stays uneven",
        summary: "Some floating-rate loans may respond to earlier transmission while fixed-rate contracts and bank-specific pricing do not.",
        kind: "Causal hypothesis",
        confidence: "Medium",
        evidenceIds: [],
        uncertainty: "The headline cannot establish the size or timing of household-level effects.",
      },
      {
        id: "relevance",
        layer: "Relevance",
        title: "India watches the next signal",
        summary: "Students, households and small firms should watch loan resets, deposit rates, food inflation and oil—not assume an instant EMI change.",
        kind: "Evidence-supported inference",
        confidence: "Medium",
        evidenceIds: ["S1", "S3"],
        uncertainty: "Personal impact depends on the type of loan, bank and household exposure.",
      },
    ],
    whyItMatters: [
      "Household EMIs and deposit returns depend on bank transmission, not only the announcement.",
      "Small firms face different credit conditions depending on lender, collateral and loan reset structure.",
      "For young people, the decision affects education loans, job-creating investment and the wider cost of credit.",
    ],
    winners: ["Depositors if deposit rates remain firm", "Cash-rich firms with little refinancing need", "Borrowers already benefiting from earlier transmission"],
    losers: ["New borrowers if lending rates stay elevated", "Rate-sensitive small businesses", "Households assuming immediate EMI relief"],
    stressTest: {
      challengingEvidence: ["The August meeting minutes signalled that rate increases could follow if inflation becomes broader and more persistent."],
      alternatives: ["The pause may reflect temporary supply-side inflation risk rather than resilient domestic demand.", "Financial-stability or currency considerations may also influence the timing of future moves."],
      missingInformation: ["Bank-level transmission after the meeting", "The next inflation breakdown", "Borrower-specific loan reset terms"],
      changeConditions: ["A sustained rise in core inflation", "A material oil-price shock", "Clear disinflation accompanied by weaker growth"],
    },
    confidence: {
      level: "High",
      reasons: ["A current RBI primary source records the decision.", "Independent reporting agrees on the rate and stance.", "The event evidence is recent and complete; downstream effects remain conditional."],
    },
    sources: [
      {
        id: "S1",
        title: "Monetary Policy Statement, 2026-27: MPC Resolution",
        publisher: "Reserve Bank of India",
        date: "2026-08-05",
        url: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63287",
        sourceType: "Official / primary",
        relatedClaims: ["C1", "C2"],
        evidenceRole: "Supports",
        verificationDepth: "curated-review",
        excerpt: "Policy Repo Rate: 5.25%.",
        excerptKind: "verbatim",
        note: "The official resolution records a unanimous hold at 5.25% and continuation of the neutral stance.",
      },
      {
        id: "S2",
        title: "India's central bank holds rates, awaits clearer inflation signal before acting",
        publisher: "Reuters",
        date: "2026-08-05",
        url: "https://www.reuters.com/world/india/indian-central-bank-holds-rates-expected-taking-comfort-still-modest-inflation-2026-08-05/",
        sourceType: "Independent reporting",
        relatedClaims: ["C1", "C2", "C3"],
        evidenceRole: "Supports",
        verificationDepth: "curated-review",
        excerpt: "India's central bank holds rates, awaits clearer inflation signal before acting",
        excerptKind: "source-title",
        note: "Reports the unanimous hold, neutral stance and the policy trade-off around the inflation path.",
      },
      {
        id: "S3",
        title: "India rate panel signals impending hikes, eyes inflation path to gauge timing",
        publisher: "Reuters",
        date: "2026-08-19",
        url: "https://www.reuters.com/world/india/india-rate-panel-signals-impending-hikes-eyes-inflation-path-gauge-timing-2026-08-19/",
        sourceType: "Independent reporting",
        relatedClaims: ["C3"],
        evidenceRole: "Adds context",
        verificationDepth: "curated-review",
        excerpt: "India rate panel signals impending hikes, eyes inflation path to gauge timing",
        excerptKind: "source-title",
        note: "Minutes-based reporting challenges any interpretation of ‘neutral’ as a permanent pause.",
      },
      {
        id: "S4",
        title: "Database on Indian Economy",
        publisher: "Reserve Bank of India",
        date: "Continuously updated",
        url: "https://data.rbi.org.in/DBIE/#/dbie/home",
        sourceType: "Data / analysis",
        relatedClaims: ["C4"],
        evidenceRole: "Insufficient evidence",
        verificationDepth: "curated-review",
        excerpt: "Database on Indian Economy",
        excerptKind: "source-title",
        note: "Useful for policy and banking series, but it cannot verify an individual borrower’s EMI from the headline alone.",
      },
    ],
    limitations: ["This case is pre-verified for demonstration and is not a live search result.", "The map distinguishes the confirmed decision from conditional downstream effects.", "Personal financial impact requires borrower- and bank-specific information."],
  },
  {
    id: "red-sea-2024",
    mode: "curated",
    headline: "Red Sea attacks force shipping reroutes and raise trade costs",
    detectedLanguage: "English",
    updated: "Evidence checked 20 August 2026",
    shortFrame: "The rerouting is documented. The inflation effect is plausible but conditional: higher freight costs do not pass through equally to every product or country.",
    translatedFrame: {
      Hindi: "लाल सागर में हमलों के बाद जहाजों का मार्ग बदला और दूरी व परिवहन लागत बढ़ी। लेकिन अधिक मालभाड़ा हर वस्तु की कीमत में समान रूप से नहीं जुड़ता।",
      Marathi: "लाल समुद्रातील हल्ल्यांनंतर जहाजांचे मार्ग बदलले आणि अंतर व वाहतूक खर्च वाढला. मात्र वाढलेला मालवाहतूक खर्च प्रत्येक वस्तूच्या किमतीत समान प्रमाणात जात नाही.",
    },
    claims: [
      { id: "C1", text: "Attacks in the Red Sea disrupted commercial shipping.", category: "Event", kind: "Confirmed fact", evidenceIds: ["S1", "S2", "S3"], isHeadlineClaim: true },
      { id: "C2", text: "Carriers rerouted vessels away from the Suez route.", category: "Consequence", kind: "Confirmed fact", evidenceIds: ["S1", "S2"], isHeadlineClaim: true },
      { id: "C3", text: "Longer routes increased capacity pressure and trade costs.", category: "Consequence", kind: "Confirmed fact", evidenceIds: ["S1", "S3", "S4"], isHeadlineClaim: true },
      { id: "C4", text: "The disruption caused broad consumer-price inflation everywhere.", category: "Causal hypothesis", kind: "Unverified claim", evidenceIds: [], isHeadlineClaim: false },
    ],
    confirmed: ["Suez Canal trade fell sharply in early 2024 as vessels used alternative routes.", "Rerouting increased journey distance and delivery time.", "International institutions recorded higher shipping pressure and supply-chain disruption."],
    uncertain: ["How much freight cost was absorbed by firms rather than consumers.", "How persistent the disruption and rate increases would be.", "The size of India-specific price pass-through by sector."],
    nodes: [
      { id: "signal", layer: "Signal", title: "Security shock hits a chokepoint", summary: "Attacks made a systemically important route riskier for commercial vessels.", kind: "Confirmed fact", confidence: "High", evidenceIds: ["S1", "S2", "S3"], uncertainty: "The incidents are documented; the duration of disruption varies over time." },
      { id: "mechanism", layer: "Mechanism", title: "Ships take the longer route", summary: "Rerouting around the Cape adds sailing time and ties up vessel capacity.", kind: "Confirmed fact", confidence: "High", evidenceIds: ["S1", "S2"], uncertainty: "Not every carrier, cargo or journey reroutes in the same way." },
      { id: "dependency", layer: "Hidden dependency", title: "Capacity and insurance transmit cost", summary: "Longer journeys, insurance risk and schedule disruption can lift freight rates even without a shortage of goods.", kind: "Evidence-supported inference", confidence: "Medium", evidenceIds: ["S3", "S4"], uncertainty: "Contract structures and spare capacity affect the size of the increase." },
      { id: "consequence", layer: "Wider consequence", title: "Input costs spread unevenly", summary: "Time-sensitive and low-margin supply chains face more pressure than high-margin or well-stocked firms.", kind: "Causal hypothesis", confidence: "Medium", evidenceIds: ["S3", "S4"], uncertainty: "Firms may absorb, delay or pass through the cost." },
      { id: "relevance", layer: "Relevance", title: "India’s exposure is selective", summary: "Importers, exporters and consumers can be affected through delivery times and input prices, but sector exposure differs.", kind: "Causal hypothesis", confidence: "Medium", evidenceIds: ["S3", "S4"], uncertainty: "A headline alone cannot quantify India-wide inflation." },
    ],
    whyItMatters: ["India trades heavily by sea, so delays can matter before a product becomes visibly scarce.", "Students and households may see indirect effects through electronics, fuel-linked logistics and imported inputs.", "The case shows how a distant chokepoint becomes a business and cost-of-living risk."],
    winners: ["Carriers able to charge higher rates", "Ports and routes receiving diverted traffic", "Firms holding resilient inventories"],
    losers: ["Time-sensitive exporters", "Importers with thin margins", "Consumers when costs are passed through"],
    stressTest: {
      challengingEvidence: ["A freight-rate increase does not by itself prove broad consumer inflation; firms may absorb costs and rates can normalise."],
      alternatives: ["Other shipping constraints and demand changes can move freight rates at the same time.", "Inventory strategy and contract pricing can matter more than the spot rate for some firms."],
      missingInformation: ["India-sector freight contracts", "Firm inventory buffers", "Actual retail-price pass-through"],
      changeConditions: ["A durable security improvement", "Greater vessel capacity", "Weak trade demand", "A new escalation affecting more routes"],
    },
    confidence: { level: "High", reasons: ["IMF, World Bank and independent reporting agree on the rerouting and trade disruption.", "The route mechanism is directly observable.", "Consumer-price consequences remain conditional and are labelled as hypotheses."] },
    sources: [
      { id: "S1", title: "Red Sea Attacks Disrupt Global Trade", publisher: "International Monetary Fund", date: "2024-03-07", url: "https://www.imf.org/en/blogs/articles/2024/03/07/red-sea-attacks-disrupt-global-trade", sourceType: "Official / primary", relatedClaims: ["C1", "C2"], evidenceRole: "Supports", verificationDepth: "curated-review", excerpt: "Suez Canal trade dropped by 50 percent from a year earlier.", excerptKind: "verbatim", note: "Records a 50% year-on-year fall in Suez Canal trade in the first two months of 2024 and increased Cape traffic." },
      { id: "S2", title: "Will a prolonged rerouting of ships from Suez trigger a new supply chain crisis?", publisher: "World Bank", date: "2024-01-19", url: "https://blogs.worldbank.org/en/trade/will-prolonged-rerouting-ships-suez-trigger-new-supply-chain-crisis", sourceType: "Data / analysis", relatedClaims: ["C1", "C2"], evidenceRole: "Supports", verificationDepth: "curated-review", excerpt: "adding 3,000 to 3,500 nautical miles (5,500 to 6,500 km) and seven to 10 days", excerptKind: "verbatim", note: "Documents the 3,000–3,500 nautical-mile detour, added sailing time and shipping capacity absorbed by rerouting." },
      { id: "S3", title: "Freight through Suez Canal down 45% since Houthi attacks, UNCTAD says", publisher: "Reuters", date: "2024-01-26", url: "https://www.reuters.com/world/middle-east/freight-through-suez-canal-down-45-since-houthi-attacks-unctad-2024-01-26/", sourceType: "Independent reporting", relatedClaims: ["C1", "C3"], evidenceRole: "Supports", verificationDepth: "curated-review", excerpt: "Freight through Suez Canal down 45% since Houthi attacks, UNCTAD says", excerptKind: "source-title", note: "Independent reporting on UNCTAD’s evidence and the cost implications of rerouting." },
      { id: "S4", title: "Shipping disruptions in the Red Sea: Global ripples", publisher: "Federal Reserve Bank of St. Louis", date: "2024-02-15", url: "https://www.stlouisfed.org/on-the-economy/2024/feb/shipping-disruptions-red-sea-ripples-globe", sourceType: "Data / analysis", relatedClaims: ["C3", "C4"], evidenceRole: "Adds context", verificationDepth: "curated-review", excerpt: "shipping companies have altered their routes to avoid the Suez Canal and the Red Sea", excerptKind: "verbatim", note: "Explains cost transmission while leaving the magnitude of final consumer-price pass-through open." },
    ],
    limitations: ["This is a pre-verified historical demonstration, not a statement that conditions are unchanged today.", "Trade-cost evidence is stronger than the claim of broad consumer-price inflation.", "India-specific impact remains a scenario until sector data is added."],
  },
  {
    id: "ai-energy-2030",
    mode: "curated",
    headline: "Data-centre electricity demand is projected to double by 2030 as AI expands",
    detectedLanguage: "English",
    updated: "Evidence checked 20 August 2026",
    shortFrame: "This is a scenario-based projection, not a confirmed future outcome. AI is an important driver, while efficiency, grid delays and adoption rates can change the result.",
    translatedFrame: {
      Hindi: "डेटा सेंटरों की बिजली मांग 2030 तक लगभग दोगुनी होने का अनुमान है, लेकिन यह भविष्यवाणी है—पक्का तथ्य नहीं। दक्षता, ग्रिड की देरी और एआई अपनाने की गति परिणाम बदल सकती है।",
      Marathi: "डेटा सेंटरची वीज मागणी २०३० पर्यंत जवळपास दुप्पट होण्याचा अंदाज आहे; हा भविष्यकालीन अंदाज आहे, निश्चित तथ्य नाही. कार्यक्षमता, ग्रिडमधील विलंब आणि एआयचा स्वीकार यामुळे परिणाम बदलू शकतो.",
    },
    claims: [
      { id: "C1", text: "The IEA projects global data-centre electricity demand to roughly double by 2030.", category: "Event", kind: "Confirmed fact", evidenceIds: ["S1", "S2"], isHeadlineClaim: true },
      { id: "C2", text: "AI is an important driver of the projected increase.", category: "Cause", kind: "Confirmed fact", evidenceIds: ["S1", "S2"], isHeadlineClaim: true },
      { id: "C3", text: "The projected demand will definitely occur.", category: "Consequence", kind: "Unverified claim", evidenceIds: [], isHeadlineClaim: false },
      { id: "C4", text: "Higher AI use necessarily creates the same grid pressure in every region.", category: "Causal hypothesis", kind: "Unverified claim", evidenceIds: [], isHeadlineClaim: false },
    ],
    confirmed: ["The IEA published a base-case projection near 945 TWh by 2030.", "The projection is roughly double the cited 2024 level.", "The IEA identifies AI as the most important growth driver alongside other digital services."],
    uncertain: ["The pace of AI adoption and inference demand.", "How quickly energy efficiency improves per task.", "Where grid connection bottlenecks delay or relocate projects."],
    nodes: [
      { id: "signal", layer: "Signal", title: "A base-case demand projection", summary: "The IEA projects data-centre electricity use to reach roughly 945 TWh by 2030.", kind: "Confirmed fact", confidence: "High", evidenceIds: ["S1", "S2"], uncertainty: "The existence of the projection is confirmed; the 2030 outcome is not." },
      { id: "mechanism", layer: "Mechanism", title: "More compute needs infrastructure", summary: "Growing AI and digital workloads increase demand for servers, cooling and reliable power.", kind: "Evidence-supported inference", confidence: "Medium", evidenceIds: ["S1", "S3"], uncertainty: "Workload mix and utilisation determine energy use." },
      { id: "dependency", layer: "Hidden dependency", title: "Efficiency races scale", summary: "Electricity per AI task can fall while total demand still rises if usage grows faster.", kind: "Causal hypothesis", confidence: "Medium", evidenceIds: ["S3"], uncertainty: "Model design, hardware and behaviour can change both sides of the race." },
      { id: "consequence", layer: "Wider consequence", title: "Grid access becomes strategic", summary: "Connection queues, generation and cooling can shape where data centres are built and which suppliers benefit.", kind: "Causal hypothesis", confidence: "Medium", evidenceIds: ["S2", "S4"], uncertainty: "Pressure is geographically concentrated rather than uniform." },
      { id: "relevance", layer: "Relevance", title: "India weighs capacity and constraint", summary: "The opportunity includes infrastructure and technical jobs; the risk is local pressure on power, land, water and capital.", kind: "Causal hypothesis", confidence: "Low", evidenceIds: ["S1", "S4"], uncertainty: "This source set does not quantify a specific India outcome." },
    ],
    whyItMatters: ["AI is not only a software story; power systems and industrial supply chains sit underneath it.", "Young people may see new technical and infrastructure jobs alongside local resource trade-offs.", "Policy choices on grids and clean power can influence where investment lands."],
    winners: ["Grid-equipment and cooling suppliers", "Regions with available reliable power", "Efficient data-centre operators"],
    losers: ["Grid-constrained regions", "Inefficient operators", "Communities bearing costs without clear benefits"],
    stressTest: {
      challengingEvidence: ["The IEA’s 945 TWh figure is a base case; a trade-war headwind scenario was materially lower, and project delays can reduce realised demand."],
      alternatives: ["Efficiency gains may offset more demand than expected.", "Demand could shift geographically rather than rising uniformly.", "Non-AI digital services also contribute to data-centre growth."],
      missingInformation: ["Future model efficiency", "Actual utilisation rates", "Country-level project completion", "Local water and grid constraints"],
      changeConditions: ["Slower AI adoption", "Faster chip and cooling efficiency", "Grid-connection delays", "New energy or permitting policy"],
    },
    confidence: { level: "High", reasons: ["A primary IEA report directly states the projection.", "Independent reporting confirms the scenario and its caveats.", "The interface labels the 2030 value as a projection rather than a fact about the future."] },
    sources: [
      { id: "S1", title: "Energy demand from AI", publisher: "International Energy Agency", date: "2025-04-10", url: "https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai", sourceType: "Official / primary", relatedClaims: ["C1", "C2"], evidenceRole: "Supports", verificationDepth: "curated-review", excerpt: "global electricity consumption for data centres is projected to double to reach around 945 TWh by 2030 in the Base Case", excerptKind: "verbatim", note: "IEA base case projects about 945 TWh of data-centre electricity demand in 2030, just under 3% of global electricity use." },
      { id: "S2", title: "Energy and AI: Executive summary", publisher: "International Energy Agency", date: "2025-04-10", url: "https://www.iea.org/reports/energy-and-ai/executive-summary", sourceType: "Data / analysis", relatedClaims: ["C1", "C2"], evidenceRole: "Supports", verificationDepth: "curated-review", excerpt: "Data centre electricity consumption is set to more than double to around 945 TWh by 2030.", excerptKind: "verbatim", note: "Summarises the projection and identifies AI as the most important growth driver." },
      { id: "S3", title: "Data centre electricity use surged in 2025, even with tightening bottlenecks", publisher: "International Energy Agency", date: "2026-04-16", url: "https://www.iea.org/news/data-centre-electricity-use-surged-in-2025-even-with-tightening-bottlenecks-driving-a-scramble-for-solutions", sourceType: "Official / primary", relatedClaims: ["C2", "C3"], evidenceRole: "Adds context", verificationDepth: "curated-review", excerpt: "power consumption per AI task is declining rapidly, with efficiency improving at a rate unprecedented in energy history", excerptKind: "verbatim", note: "Updates the outlook and notes rapid efficiency improvement alongside rising AI use and bottlenecks." },
      { id: "S4", title: "Global trade war may produce headwinds for nascent AI sector, IEA says", publisher: "Reuters", date: "2025-04-10", url: "https://www.reuters.com/technology/artificial-intelligence/global-trade-war-may-produce-headwinds-nascent-ai-sector-iea-says-2025-04-10/", sourceType: "Independent reporting", relatedClaims: ["C3", "C4"], evidenceRole: "Adds context", verificationDepth: "curated-review", excerpt: "Global trade war may produce headwinds for nascent AI sector, IEA says", excerptKind: "source-title", note: "Reports the IEA’s lower headwind scenario and project delays, challenging any claim that the base-case outcome is certain." },
    ],
    limitations: ["This case explains a published projection; it does not certify a future outcome.", "The global evidence does not prove uniform local grid effects.", "India relevance is a transparent hypothesis pending India-specific project and energy data."],
  },
];

export const demoCases: AnalysisResult[] = coreDemoCases.map((result) => enrichAnalysisResult(result));

export { auditResultLayers, withUserProfile } from "../lib/resultExperience.ts";

export function findDemoCase(headline: string) {
  const normalised = headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return demoCases.find((item) => {
    const candidate = item.headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return normalised === candidate;
  });
}
