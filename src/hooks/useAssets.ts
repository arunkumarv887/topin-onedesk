import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Asset } from '../types/asset';

export const useAssets = (userId?: string, isAdmin?: boolean, userEmail?: string | null) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  const refetch = () => setReloadIndex((value) => value + 1);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        setLoading(true);
        const assetsCollection = collection(db, 'assets');
        const snapshot = await getDocs(assetsCollection);
        let assetsList = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
          purchaseDate: doc.data().purchaseDate?.toDate(),
          warrantyExpiration: doc.data().warrantyExpiration?.toDate(),
        } as Asset));

        if (!isAdmin) {
          const normalizedEmail = userEmail?.toLowerCase();
          assetsList = assetsList.filter((asset) => {
            const matchesOwner = asset.owner === userId;
            const matchesEmail = !!normalizedEmail && asset.userEmail?.toLowerCase() === normalizedEmail;
            return matchesOwner || matchesEmail;
          });
        }

        setAssets(assetsList);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch assets');
      } finally {
        setLoading(false);
      }
    };

    fetchAssets();
  }, [userId, userEmail, isAdmin, reloadIndex]);

  return { assets, loading, error, refetch };
};
