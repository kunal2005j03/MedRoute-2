import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEMO_ACCOMMODATIONS,
  DEMO_MEDICAL_CHARGES,
  DEMO_PROVIDER_SERVICES,
  DEMO_PROVIDERS,
  SERVICE_CATALOG,
} from '../data/demoDataset';
import type {
  AccommodationRecord,
  MedicalChargeRecord,
  MedicalService,
  ProviderRecord,
  ProviderServiceRecord,
} from '../types/medroute';
import { auth, db, handleFirestoreError, OperationType } from './firebase';

export interface FirestoreCatalogSnapshot {
  providers: ProviderRecord[];
  services: MedicalService[];
  providerServices: ProviderServiceRecord[];
  medicalCharges: MedicalChargeRecord[];
  accommodations: AccommodationRecord[];
  fromFirestore: boolean;
  isEmpty: boolean;
  errorMessage?: string | null;
}

const CATALOG_ORIGINS = ['verified', 'demo'] as const;
const VALID_CATEGORIES = [
  'Consultation',
  'Diagnostics',
  'Treatment and Procedures',
] as const;

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.toLowerCase().includes('permission') ||
    message.toLowerCase().includes('permission-denied')
  );
}

async function listCollectionWithContext<T>(
  collectionPath: string,
  originsOrCategoriesField: string,
  values: readonly string[]
): Promise<T[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, collectionPath),
        where(originsOrCategoriesField, 'in', [...values])
      )
    );
    return snap.docs.map((d) => d.data() as T);
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
    }
    throw error;
  }
}

export async function fetchFirestoreCatalog(): Promise<FirestoreCatalogSnapshot> {
  try {
    const [providers, services, providerServices, medicalCharges, accommodations] =
      await Promise.all([
        listCollectionWithContext<ProviderRecord>(
          'providers',
          'dataOrigin',
          CATALOG_ORIGINS
        ),
        listCollectionWithContext<MedicalService>(
          'services',
          'category',
          VALID_CATEGORIES
        ),
        listCollectionWithContext<ProviderServiceRecord>(
          'providerServices',
          'dataOrigin',
          CATALOG_ORIGINS
        ),
        listCollectionWithContext<MedicalChargeRecord>(
          'medicalCharges',
          'dataOrigin',
          CATALOG_ORIGINS
        ),
        listCollectionWithContext<AccommodationRecord>(
          'accommodations',
          'dataOrigin',
          CATALOG_ORIGINS
        ),
      ]);

    const isEmpty = providers.length === 0 && services.length === 0;

    return {
      providers,
      services,
      providerServices,
      medicalCharges,
      accommodations,
      fromFirestore: true,
      isEmpty,
      errorMessage: null,
    };
  } catch {
    return {
      providers: [],
      services: [],
      providerServices: [],
      medicalCharges: [],
      accommodations: [],
      fromFirestore: false,
      isEmpty: true,
      errorMessage:
        'Unable to read Firestore catalog right now. Demo Mode remains available offline.',
    };
  }
}

function sanitizeProviderForFirestore(p: ProviderRecord) {
  return {
    providerId: p.providerId,
    name: p.name.slice(0, 160),
    providerType: p.providerType,
    address: p.address.slice(0, 300),
    city: p.city.slice(0, 80),
    state: p.state.slice(0, 80),
    pincode: p.pincode ? p.pincode.slice(0, 16) : null,
    latitude: p.latitude,
    longitude: p.longitude,
    phone: p.phone ? p.phone.slice(0, 40) : null,
    website: p.website ? p.website.slice(0, 240) : null,
    source: p.source.slice(0, 160),
    lastVerified: p.lastVerified.slice(0, 40),
    dataOrigin: p.dataOrigin === 'verified' ? 'verified' : 'demo',
  };
}

export function sanitizeChargeForFirestore(c: MedicalChargeRecord) {
  const payload: Record<string, unknown> = {
    chargeId: c.chargeId.slice(0, 128),
    providerId: c.providerId.slice(0, 128),
    serviceId: c.serviceId.slice(0, 128),
    amount: typeof c.amount === 'number' && c.amount > 0 ? c.amount : null,
    minAmount: typeof c.minAmount === 'number' && c.minAmount > 0 ? c.minAmount : null,
    maxAmount: typeof c.maxAmount === 'number' && c.maxAmount > 0 ? c.maxAmount : null,
    chargeType: c.chargeType,
    sourceName: c.sourceName.slice(0, 160),
    sourceUrl: c.sourceUrl ? c.sourceUrl.slice(0, 500) : null,
    lastVerified: c.lastVerified.slice(0, 40),
    verificationStatus: c.verificationStatus,
    dataOrigin: c.dataOrigin === 'verified' ? 'verified' : 'demo',
  };

  if (c.includesNote !== undefined) {
    payload.includesNote = c.includesNote ? c.includesNote.slice(0, 280) : null;
  }

  return payload;
}

function sanitizeAccommodationForFirestore(a: AccommodationRecord) {
  return {
    accommodationId: a.accommodationId,
    name: a.name.slice(0, 160),
    accommodationType: a.accommodationType,
    address: a.address.slice(0, 300),
    city: a.city.slice(0, 80),
    latitude: a.latitude,
    longitude: a.longitude,
    minNightlyPrice: a.minNightlyPrice ?? null,
    maxNightlyPrice: a.maxNightlyPrice ?? null,
    priceSource: a.priceSource.slice(0, 160),
    lastVerified: a.lastVerified.slice(0, 40),
    dataOrigin: a.dataOrigin === 'verified' ? 'verified' : 'demo',
  };
}

/**
 * Seeds the sample Greater Kolkata dataset into Cloud Firestore when collections are empty.
 * Requires verified admin sign-in per firestore.rules; never fails silently.
 */
export async function seedSampleDatasetToFirestore(): Promise<{
  seeded: boolean;
  recordCount: number;
  message: string;
}> {
  if (!auth.currentUser) {
    return {
      seeded: false,
      recordCount: 0,
      message: 'Admin sign-in is required to write initial sample records into Firestore.',
    };
  }

  try {
    const batch = writeBatch(db);
    let count = 0;

    for (const s of SERVICE_CATALOG) {
      batch.set(doc(db, 'services', s.serviceId), {
        serviceId: s.serviceId,
        category: s.category,
        serviceName: s.serviceName.slice(0, 120),
        description: s.description.slice(0, 400),
      });
      count++;
    }

    for (const p of DEMO_PROVIDERS) {
      batch.set(
        doc(db, 'providers', p.providerId),
        sanitizeProviderForFirestore(p)
      );
      count++;
    }

    for (const ps of DEMO_PROVIDER_SERVICES) {
      batch.set(doc(db, 'providerServices', ps.recordId), {
        recordId: ps.recordId,
        providerId: ps.providerId,
        serviceId: ps.serviceId,
        verificationStatus: ps.verificationStatus,
        source: ps.source.slice(0, 160),
        lastVerified: ps.lastVerified.slice(0, 40),
        dataOrigin: ps.dataOrigin,
      });
      count++;
    }

    for (const chg of DEMO_MEDICAL_CHARGES) {
      batch.set(
        doc(db, 'medicalCharges', chg.chargeId),
        sanitizeChargeForFirestore(chg)
      );
      count++;
    }

    for (const acc of DEMO_ACCOMMODATIONS) {
      batch.set(
        doc(db, 'accommodations', acc.accommodationId),
        sanitizeAccommodationForFirestore(acc)
      );
      count++;
    }

    await batch.commit();

    return {
      seeded: true,
      recordCount: count,
      message: `Seeded ${count} clearly labeled Demo Data records into Cloud Firestore.`,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'batch-seed');
  }
}
