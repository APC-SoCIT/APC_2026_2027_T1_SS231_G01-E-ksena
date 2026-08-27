# Responder WebRTC Guide (Web Application)

This guide provides the exact React code needed for the Responder Web Dashboard to answer the incoming live video emergency reports sent by the mobile app.

## 1. How it works
1. The mobile app broadcasts a WebRTC offer to a Supabase Realtime channel named webrtc-incident-{incidentId}.
2. The Web Dashboard joins that same channel, reads the offer, and sends back an nswer.
3. A direct Peer-to-Peer video tunnel is created.

## 2. Prerequisites
Make sure your web project has Supabase installed:
`ash
npm install @supabase/supabase-js
`

## 3. The React Component
Create a new file named ResponderVideoPlayer.jsx (or .tsx) in your web project and paste this code. It handles the entire WebRTC connection automatically.

`	sx
import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase credentials
const SUPABASE_URL = 'https://cwhduwianpugjbnqzmhs.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ResponderVideoPlayer = ({ incidentId }) => {
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [status, setStatus] = useState('Waiting for caller...');

  useEffect(() => {
    if (!incidentId) return;

    // 1. Setup WebRTC Peer Connection
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    peerConnectionRef.current = pc;

    // 2. When we receive the remote video stream, attach it to the <video> element
    pc.ontrack = (event) => {
      console.log('Received remote track!');
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setStatus('Live Stream Connected 🔴');
      }
    };

    // 3. Connect to Supabase Realtime Channel
    const channel = supabase.channel(webrtc-incident-${incidentId});

    // Send our ICE candidates to the mobile app
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: 'broadcast',
          event: 'webrtc-signaling',
          payload: { type: 'candidate', candidate: event.candidate, sender: 'responder' }
        });
      }
    };

    // 4. Listen for signaling messages from the Mobile App
    channel.on('broadcast', { event: 'webrtc-signaling' }, async ({ payload }) => {
      if (payload.sender === 'responder') return; // Ignore our own messages

      try {
        if (payload.type === 'offer') {
          setStatus('Incoming call... Connecting...');
          // Accept the offer
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          
          // Create an answer
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          // Send the answer back to mobile
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signaling',
            payload: { type: 'answer', answer: answer, sender: 'responder' }
          });
        } 
        else if (payload.type === 'candidate' && payload.candidate) {
          // Add ICE candidates from the mobile app
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (error) {
        console.error('WebRTC Error:', error);
        setStatus('Connection error');
      }
    });

    // Subscribe to the channel
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Joined signaling channel for incident:', incidentId);
      }
    });

    // Cleanup when component unmounts
    return () => {
      pc.close();
      channel.unsubscribe();
    };
  }, [incidentId]);

  return (
    <div style={{ width: '100%', maxWidth: '600px', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px', backgroundColor: '#1f2937', color: '#fff', fontWeight: 'bold' }}>
        {status}
      </div>
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{ width: '100%', height: '400px', objectFit: 'cover' }}
      />
    </div>
  );
};

export default ResponderVideoPlayer;
`

## 4. How to use it in the Dashboard
Whenever a responder clicks on an emergency pin on the map, render this component and pass the incidentId from your database to it:

`jsx
import ResponderVideoPlayer from './ResponderVideoPlayer';

function DashboardIncidentDetails({ selectedIncident }) {
  return (
    <div>
      <h2>Emergency Incident: #{selectedIncident.incident_id}</h2>
      <p>Location: {selectedIncident.lat}, {selectedIncident.lng}</p>

      {/* The Live Video Feed */}
      <ResponderVideoPlayer incidentId={selectedIncident.incident_id} />
    </div>
  );
}
`

That's it! As long as the incidentId perfectly matches the one saved in the database, the video tunnel will automatically connect to the mobile user.