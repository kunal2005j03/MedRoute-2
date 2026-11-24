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

const VALID_ORIGINS = ['verified', 'demo'] as const;
const VALID_CATEGORIES = [
  'Consultation',
  'Diagnostics',
  'Treatment and Procedures',
] as const;

export async function fetchFirestoreCatalog(): Promise<FirestoreCatalogSnapshot> {
  try {
    const [providersSnap, servicesSnap, psSnap, chargesSnap, accSnap] =
      await Promise.all([
        getDocs(
          query(
            collection(db, 'providers'),
            where('dataOrigin', 'in', [...VALID_ORIGINS])
          )
        ),
        getDocs(
          query(
            collection(db, 'services'),
            where('category', 'in', [...VALID_CATEGORIES])
          )
        ),
        getDocs(
          query(
            collection(db, 'providerServices'),
            where('dataOrigin', 'in', [...VALID_ORIGINS])
          )
        ),
        getDocs(
          query(
            collection(db, 'medicalCharges'),
            where('dataOrigin', 'in', [...VALID_ORIGINS])
          )
        ),
        getDocs(
          query(
            collection(db, 'accommodations'),
            where('dataOrigin', 'in', [...VALID_ORIGINS])
          )
        ),
      ]);

    const providers = providersSnap.docs.map((d) => d.data() as ProviderRecord);
    const services = servicesSnap.docs.map((d) => d.data() as MedicalService);
    const providerServices = psSnap.docs.map(
      (d) => d.data() as ProviderServiceRecord
    );
    const medicalCharges = chargesSnap.docs.map(
      (d) => d.data() as MedicalChargeRecord
    );
    const accommodations = accSnap.docs.map(
      (d) => d.data() as AccommodationRecord
    );

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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('permission')) {
      try {
        handleFirestoreError(error, OperationType.LIST, 'providers');
      } catch {
        // Logged structured FirestoreErrorInfo above; return safe non-crashing state to UI
      }
    }
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

function sanitizeChargeForFirestore(c: MedicalChargeRecord) {
  return {
    chargeId: c.chargeId,
    providerId: c.providerId,
    serviceId: c.serviceId,
    amount: c.amount ?? null,
    minAmount: c.minAmount ?? null,
    maxAmount: c.maxAmount ?? null,
    chargeType: c.chargeType,
    sourceName: c.sourceName.slice(0, 160),
    sourceUrl: c.sourceUrl ? c.sourceUrl.slice(0, 240) : null,
    lastVerified: c.lastVerified.slice(0, 40),
    verificationStatus: c.verificationStatus,
    dataOrigin: c.dataOrigin,
  };
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
