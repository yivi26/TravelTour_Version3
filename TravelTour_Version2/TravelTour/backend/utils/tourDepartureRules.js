/** Tỷ lệ tối thiểu: trên 50% sức chứa (booked > max_capacity * 0.5). */
export const DEPARTURE_MIN_FILL_RATIO = 0.5;

export function evaluateTourDepartureEligibility({
  maxCapacity = 0,
  bookedParticipants = 0,
  guideId = null,
} = {}) {
  const cap = Math.max(0, Number(maxCapacity) || 0);
  const booked = Math.max(0, Number(bookedParticipants) || 0);
  const hasGuide = guideId != null && Number(guideId) > 0;
  const hasEnoughGuests = cap > 0 && booked > cap * DEPARTURE_MIN_FILL_RATIO;
  const canDepart = hasGuide && hasEnoughGuests;
  const minGuestsRequired = cap > 0 ? Math.floor(cap * DEPARTURE_MIN_FILL_RATIO) + 1 : 0;
  const fillPercent = cap > 0 ? Math.round((booked / cap) * 1000) / 10 : 0;

  const reasons = [];
  if (!hasGuide) {
    reasons.push("Chưa có hướng dẫn viên được phân công");
  }
  if (!hasEnoughGuests) {
    reasons.push(
      `Chưa đủ khách (cần trên 50% sức chứa: tối thiểu ${minGuestsRequired}/${cap} khách, hiện ${booked}/${cap})`
    );
  }

  return {
    canDepart,
    hasGuide,
    hasEnoughGuests,
    maxCapacity: cap,
    bookedParticipants: booked,
    minGuestsRequired,
    fillPercent,
    reasons,
  };
}

export function formatTourDepartureBlockMessage(eligibility) {
  if (!eligibility || eligibility.canDepart) return null;
  const parts = Array.isArray(eligibility.reasons)
    ? eligibility.reasons.filter(Boolean)
    : [];
  if (!parts.length) {
    return "Tour chưa đủ điều kiện khởi hành.";
  }
  return `Tour chưa đủ điều kiện khởi hành: ${parts.join("; ")}.`;
}

export function buildTourDeparturePayload(row = {}) {
  const eligibility = evaluateTourDepartureEligibility({
    maxCapacity: row.max_capacity ?? row.maxCapacity,
    bookedParticipants: row.booked_participants ?? row.bookedParticipants,
    guideId: row.guide_id ?? row.guideId,
  });

  return {
    can_depart: eligibility.canDepart,
    has_guide: eligibility.hasGuide,
    has_enough_guests: eligibility.hasEnoughGuests,
    max_capacity: eligibility.maxCapacity,
    booked_participants: eligibility.bookedParticipants,
    min_guests_required: eligibility.minGuestsRequired,
    fill_percent: eligibility.fillPercent,
    message: formatTourDepartureBlockMessage(eligibility),
    reasons: eligibility.reasons,
  };
}
