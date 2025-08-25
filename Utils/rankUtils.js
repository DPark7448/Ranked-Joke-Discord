function calculateRank(points) {
    if (points >= 3001) return "Grandmaster";
    if (points >= 2501) return "Ascendant";
    if (points >= 2001) return "Diamond";
    if (points >= 1501) return "Platinum";
    if (points >= 1001) return "Gold";
    if (points >= 501) return "Silver";
    return "Bronze";
  }
  
  module.exports = { calculateRank };
  