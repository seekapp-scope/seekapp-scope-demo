export const result = {
  scope: { confirmed: ['A mobile-friendly booking website for a salon with three staff.'], deliverables: ['Proposed booking interface, subject to decisions below.'], assumptions: ['The owner will approve the booking rules before implementation.'], out_of_scope: ['Payment processing until the owner confirms whether it is needed.'] },
  questions: ['Are deposits required?', 'How should cancellations and staff availability work?', 'Who will provide the content?'],
  risks: ['No launch date or budget is confirmed.'],
  proposal: 'We propose confirming the booking rules, content and launch expectations before quoting implementation. Prices and delivery dates remain to be agreed.'
};
export const review = {
  summary:'The edited draft contains an unsupported delivery promise.',
  findings:[{category:'unsupported_commitment',severity:'high',issue:'Tomorrow delivery is not agreed.',evidence:'The draft promises delivery tomorrow, but the brief says no launch date is confirmed.',suggestion:'Remove the delivery promise and agree a date after clarification.'}],
  open_questions:['What launch date can both parties agree?']
};
