export function extractDestination(itineraryData: any): string {
  if (!itineraryData) return "Unknown Destination";
  
  if (Array.isArray(itineraryData.days)) {
    for (const day of itineraryData.days) {
      if (day.flight_info && day.flight_info.destination) {
        return day.flight_info.destination;
      }
      if (day.itinerary && Array.isArray(day.itinerary.path)) {
        for (const stop of day.itinerary.path) {
          if (stop.poi && stop.poi.city) {
            return stop.poi.city;
          }
        }
      }
    }
  }
  return "Unknown Destination";
}

export function countWaypoints(itineraryData: any): number {
  if (!itineraryData) return 0;
  
  if (Array.isArray(itineraryData.days)) {
    return itineraryData.days.reduce((acc: number, day: any) => {
      let count = 0;
      if (day.itinerary && Array.isArray(day.itinerary.path)) {
        count = day.itinerary.path.length;
      }
      return acc + count;
    }, 0);
  }
  
  if (Array.isArray(itineraryData)) {
    return itineraryData.length;
  }
  
  if (typeof itineraryData === 'object') {
    return Object.keys(itineraryData).length;
  }
  
  return 0;
}
