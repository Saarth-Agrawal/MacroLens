const latinEconomicTerms = /\b(?:econom(?:y|ic|ics)|business(?:es)?|compan(?:y|ies)|firm(?:s)?|industr(?:y|ies)|sectors?|markets?|stocks?|shares?|bonds?|invest(?:ment|or)s?|funding|revenues?|profits?|earnings|sales|banks?|credit|loans?|debt|deficit|fiscal|monetary|rbi|repo|inflation|gdp|growth|prices?|costs?|consumers?|demand|supply|production|trade|exports?|imports?|tariffs?|tax(?:es)?|budgets?|rupee|currenc(?:y|ies)|jobs?|employment|wages?|shipping|freight|logistics|oil|gas|energy|insurance)\b/iu;
const indicEconomicTerms = /(?:अर्थव्यवस्था|आर्थिक|व्यापार|व्यवसाय|कंपनी|उद्योग|बाजार|बाज़ार|शेयर|निवेश|गुंतवणूक|बैंक|बँक|कर्ज|रेपो|आरबीआई|आरबीआय|महंगाई|महागाई|कीमत|किमती|मागणी|मांग|पुरवठा|आपूर्ति|उत्पादन|विक्री|बिक्री|निर्यात|आयात|कर|बजट|रोजगार|नोकरी|नौकरी|वेतन|पगार|नफा|मुनाफा|महसूल|राजस्व|ऊर्जा|तेल)/iu;

function clean(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function buildEconomicLensQuery(value: string) {
  const headline = clean(value);
  if (!headline) return "";
  if (latinEconomicTerms.test(headline) || indicEconomicTerms.test(headline)) return headline;

  const topicTerms = /(?:flood|drought|monsoon|storm|earthquake|crop|food|tea|बाढ़|पूर|दुष्काळ|मान्सून)/iu.test(headline)
    ? "business economic impact production supply prices jobs trade"
    : /(?:election|government|policy|law|court|war|conflict|sanction|सरकार|चुनाव|निवडणूक|युद्ध)/iu.test(headline)
    ? "business economic impact policy markets trade jobs"
    : /(?:sport|match|tournament|film|movie|music|celebrity|खेळ|चित्रपट)/iu.test(headline)
    ? "business economic impact revenue sponsorship jobs consumer demand"
    : "business economic impact companies markets prices jobs trade";

  // Retrieval queries are intentionally shorter than the input limit so the
  // economic lens cannot be truncated off a long headline by provider limits.
  return `${headline.slice(0, 220)} ${topicTerms}`;
}
