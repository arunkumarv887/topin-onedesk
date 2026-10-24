import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AssetRequest } from '../types/asset';

export const useAssetRequests = (userId?: string, isAdmin?: boolean) => {
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  const refetch = () => setReloadIndex((value) => value + 1);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const requestsCollection = collection(db, 'assetRequests');
        let q;

        if (isAdmin) {
          // Admin sees all requests
          q = query(requestsCollection);
        } else if (userId) {
          // Users see only their own requests
          q = query(requestsCollection, where('requesterId', '==', userId));
        } else {
          setRequests([]);
          setLoading(false);
          return;
        }

        const snapshot = await getDocs(q);
        const requestsList = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
          comments: doc.data().comments?.map((comment: any) => ({
            ...comment,
            createdAt: comment.createdAt?.toDate?.() || new Date(),
          })) || [],
        })) as AssetRequest[];

        setRequests(requestsList);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch requests');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [userId, isAdmin, reloadIndex]);

  const createRequest = async (requestData: Omit<AssetRequest, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await addDoc(collection(db, 'assetRequests'), {
        ...requestData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      refetch();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create request');
    }
  };

  const addComment = async (requestId: string, comment: Omit<AssetRequest['comments'][0], 'id' | 'createdAt'>) => {
    try {
      const requestRef = doc(db, 'assetRequests', requestId);
      await updateDoc(requestRef, {
        comments: arrayUnion({
          ...comment,
          createdAt: new Date(),
        }),
        updatedAt: serverTimestamp(),
      });
      refetch();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to add comment');
    }
  };

  const updateRequestStatus = async (requestId: string, status: AssetRequest['status'], adminNotes?: string) => {
    try {
      const requestRef = doc(db, 'assetRequests', requestId);
      const updateData: any = {
        status,
        updatedAt: serverTimestamp(),
      };
      
      // Only include adminNotes if it has a value
      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }
      
      await updateDoc(requestRef, updateData);
      refetch();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update request');
    }
  };

  return { requests, loading, error, refetch, createRequest, addComment, updateRequestStatus };
};
