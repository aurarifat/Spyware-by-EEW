import { doc, setDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

// WebRTC STUN servers for standard peer-to-peer connection
const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private unsubSignaling: (() => void) | null = null;

  constructor(
    private familyId: string,
    private sessionId: string,
    private onRemoteStreamReceived?: (stream: MediaStream) => void,
    private onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  ) {}

  public getLocalStream() {
    return this.localStream;
  }

  public getRemoteStream() {
    return this.remoteStream;
  }

  // Member starts sharing camera or screen
  async startStreamSender(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    this.peerConnection = new RTCPeerConnection(iceServers);

    // Add local tracks to peer connection
    this.localStream.getTracks().forEach((track) => {
      if (this.peerConnection && this.localStream) {
        this.peerConnection.addTrack(track, this.localStream);
      }
    });

    const signalDocRef = doc(db, 'families', this.familyId, 'signaling', this.sessionId);

    // Collect ICE candidates and push to signaling doc
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await setDoc(
          signalDocRef,
          { senderCandidates: [event.candidate.toJSON()] },
          { merge: true }
        );
      }
    };

    if (this.onConnectionStateChange) {
      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection) {
          this.onConnectionStateChange?.(this.peerConnection.connectionState);
        }
      };
    }

    // Create SDP Offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    await setDoc(
      signalDocRef,
      {
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        status: 'offered',
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Listen for Answer from Guardian
    this.unsubSignaling = onSnapshot(signalDocRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.answer && this.peerConnection && !this.peerConnection.currentRemoteDescription) {
        const answer = new RTCSessionDescription(data.answer);
        await this.peerConnection.setRemoteDescription(answer);
      }

      // Add receiver ICE candidates
      if (data.receiverCandidates && this.peerConnection) {
        for (const candidateData of data.receiverCandidates) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        }
      }
    });
  }

  // Guardian receives live stream
  async startStreamReceiver(): Promise<void> {
    this.peerConnection = new RTCPeerConnection(iceServers);
    this.remoteStream = new MediaStream();

    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        this.remoteStream?.addTrack(track);
      });
      if (this.onRemoteStreamReceived && this.remoteStream) {
        this.onRemoteStreamReceived(this.remoteStream);
      }
    };

    if (this.onConnectionStateChange) {
      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection) {
          this.onConnectionStateChange?.(this.peerConnection.connectionState);
        }
      };
    }

    const signalDocRef = doc(db, 'families', this.familyId, 'signaling', this.sessionId);

    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await setDoc(
          signalDocRef,
          { receiverCandidates: [event.candidate.toJSON()] },
          { merge: true }
        );
      }
    };

    // Watch for offer from member
    this.unsubSignaling = onSnapshot(signalDocRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data || !data.offer || !this.peerConnection) return;

      if (!this.peerConnection.currentRemoteDescription) {
        const offer = new RTCSessionDescription(data.offer);
        await this.peerConnection.setRemoteDescription(offer);

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        await setDoc(
          signalDocRef,
          {
            answer: {
              type: answer.type,
              sdp: answer.sdp,
            },
            status: 'answered',
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }

      // Add sender ICE candidates
      if (data.senderCandidates && this.peerConnection) {
        for (const candidateData of data.senderCandidates) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (e) {
            console.error('Error adding ICE candidate on receiver', e);
          }
        }
      }
    });
  }

  // Close and clean up WebRTC
  close() {
    if (this.unsubSignaling) {
      this.unsubSignaling();
      this.unsubSignaling = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
