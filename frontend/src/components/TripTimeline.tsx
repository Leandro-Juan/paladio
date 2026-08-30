import React from 'react';

interface TripTimelineProps {
  itinerary: any;
}

export function TripTimeline({ itinerary }: TripTimelineProps) {
  // Try to normalize the itinerary data into a list of stops.
  // The actual structure from the backend optimization engine might be complex,
  // but let's assume it has some array of items or dict of days.
  let stops: any[] = [];
  
  if (itinerary && Array.isArray(itinerary.days)) {
    itinerary.days.forEach((dayObj: any) => {
      stops.push({ isDayHeader: true, label: `DAY ${dayObj.day}` });
      
      if (dayObj.flight_info) {
        stops.push({
          name: `Flight to ${dayObj.flight_info.destination || 'Destination'}`,
          time: dayObj.flight_info.departure_time || '--:--',
          duration: 'Flight'
        });
      }
      
      if (dayObj.itinerary && Array.isArray(dayObj.itinerary.path)) {
        dayObj.itinerary.path.forEach((scheduledPoi: any) => {
          stops.push({
            name: scheduledPoi.poi?.name || "Unknown Waypoint",
            time: scheduledPoi.scheduled_start || "--:--",
            duration: scheduledPoi.poi?.duration_mins ? `${scheduledPoi.poi.duration_mins}m` : ""
          });
        });
      }
    });
  } else if (Array.isArray(itinerary)) {
    stops = itinerary;
  } else if (typeof itinerary === 'object' && itinerary !== null) {
    Object.keys(itinerary).forEach(key => {
      const dayData = itinerary[key];
      if (Array.isArray(dayData)) {
        stops.push({ isDayHeader: true, label: key });
        stops = stops.concat(dayData);
      }
    });
    if (stops.length === 0) {
      stops = [{ raw: true, data: itinerary }];
    }
  }

  if (!stops.length) return <div>No route data available.</div>;

  return (
    <div style={{ padding: '1rem' }}>
      {stops.map((stop, i) => {
        if (stop.isDayHeader) {
          return (
            <div key={i} style={{ margin: '2rem 0 1rem 0' }}>
              <h4 className="font-display text-accent" style={{ fontSize: '1.2rem', letterSpacing: '1px' }}>{stop.label.toUpperCase()}</h4>
            </div>
          );
        }

        if (stop.raw) {
          return (
            <pre key={i} className="font-mono text-sm text-muted" style={{ whiteSpace: 'pre-wrap', background: 'var(--color-surface-card)', padding: '1rem', borderRadius: '4px' }}>
              {JSON.stringify(stop.data, null, 2)}
            </pre>
          );
        }

        // Render a waypoint node
        const name = stop.name || stop.poi_name || stop.id || "Unknown Waypoint";
        const time = stop.arrival_time || stop.time || "--:--";
        const duration = stop.duration || "";
        
        return (
          <div key={i} style={{ display: 'flex', gap: '1rem', position: 'relative', marginBottom: '1.5rem' }}>
            {/* Timeline line */}
            {i !== stops.length - 1 && !stops[i+1]?.isDayHeader && (
              <div style={{ 
                position: 'absolute', 
                left: '7px', 
                top: '24px', 
                bottom: '-24px', 
                width: '2px', 
                background: 'var(--color-border)' 
              }}></div>
            )}
            
            {/* Node circle */}
            <div style={{ 
              width: '16px', 
              height: '16px', 
              borderRadius: '50%', 
              background: 'var(--color-accent-primary)',
              marginTop: '4px',
              zIndex: 1
            }}></div>
            
            {/* Content */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="font-mono" style={{ fontWeight: 600 }}>{name}</span>
                <span className="font-mono text-muted text-sm">{time}</span>
              </div>
              {duration && (
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>DWELL: {duration}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
