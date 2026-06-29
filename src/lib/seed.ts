import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Building, Category } from '../types';

export async function seedDatabase() {
  let activePath = 'buildings';
  try {
    // 1. Seed Buildings if empty
    activePath = 'buildings';
    const buildingsCol = collection(db, 'buildings');
    let buildingsSnapshot;
    try {
      buildingsSnapshot = await getDocs(buildingsCol);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'buildings');
      return;
    }
    
    if (buildingsSnapshot.empty) {
      console.log('🌱 Seeding buildings into Firestore...');
      const defaultBuildings: Building[] = [
        {
          id: 'sunrise-apts',
          name: 'Sunrise Apartments',
          address: 'Block A, Sector 62, Noida, Uttar Pradesh 201301',
          lat: 28.6280,
          lng: 77.3731,
          managerUserId: 'mgr-sunrise',
          managerEmail: 'sunrise.manager@gmail.com'
        },
        {
          id: 'greenview-soc',
          name: 'Greenview Society',
          address: 'Street 45, Gachibowli, Hyderabad, Telangana 500032',
          lat: 17.4483,
          lng: 78.3741,
          managerUserId: 'mgr-greenview',
          managerEmail: 'greenview.manager@gmail.com'
        }
      ];

      for (const building of defaultBuildings) {
        try {
          await setDoc(doc(db, 'buildings', building.id), building);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `buildings/${building.id}`);
        }
      }
      console.log('✅ Buildings seeded.');
    }

    // 2. Seed Categories if empty
    activePath = 'categories';
    const categoriesCol = collection(db, 'categories');
    let categoriesSnapshot;
    try {
      categoriesSnapshot = await getDocs(categoriesCol);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'categories');
      return;
    }

    if (categoriesSnapshot.empty) {
      console.log('🌱 Seeding categories into Firestore...');
      const defaultCategories: Category[] = [
        // My Flat Categories
        { id: 'flat-plumbing', tier: 'flat', name: 'Plumbing', subtag: 'Leaking pipe or clogged drain', baseSeverity: 2, evidenceType: 'photo' },
        { id: 'flat-electrical', tier: 'flat', name: 'Electrical', subtag: 'Power outage or wiring flicker', baseSeverity: 3, evidenceType: 'photo' },
        { id: 'flat-door-lock', tier: 'flat', name: 'Door/window/lock', subtag: 'Broken handle or locked out', baseSeverity: 2, evidenceType: 'photo' },
        { id: 'flat-appliance', tier: 'flat', name: 'Appliance', subtag: 'Geyser or intercom malfunctioning', baseSeverity: 2, evidenceType: 'photo' },
        { id: 'flat-other', tier: 'flat', name: 'Other', subtag: 'Miscellaneous in-flat issue', baseSeverity: 1, evidenceType: 'photo' },

        // Common Area Categories
        { id: 'common-lift', tier: 'common_area', name: 'Lift', subtag: 'Lift stuck or not functioning', baseSeverity: 4, evidenceType: 'video' },
        { id: 'common-electrical', tier: 'common_area', name: 'Common electrical', subtag: 'Corridor or parking lights broken', baseSeverity: 2, evidenceType: 'photo' },
        { id: 'common-plumbing', tier: 'common_area', name: 'Common plumbing/water tank', subtag: 'Main line leak or low water pressure', baseSeverity: 3, evidenceType: 'photo' },
        { id: 'common-cleanliness', tier: 'common_area', name: 'Cleanliness/security', subtag: 'Lobby trash or broken entrance gate', baseSeverity: 2, evidenceType: 'photo' },
        { id: 'common-structural', tier: 'common_area', name: 'Structural (cracks/seepage)', subtag: 'Basement flooding or pillar cracks', baseSeverity: 4, evidenceType: 'photo' },
        { id: 'common-other', tier: 'common_area', name: 'Other', subtag: 'Other general building issue', baseSeverity: 1, evidenceType: 'photo' },

        // Public Street Categories
        { id: 'public-roads', tier: 'public', name: 'Roads', subtag: 'Potholes or damaged pavement', baseSeverity: 3, evidenceType: 'photo' },
        { id: 'public-streetlights', tier: 'public', name: 'Streetlights & electrical', subtag: 'Dark street or hanging power cables', baseSeverity: 3, evidenceType: 'photo' },
        { id: 'public-garbage', tier: 'public', name: 'Garbage & waste', subtag: 'Overflowing dustbin or plastic dumping', baseSeverity: 2, evidenceType: 'photo' },
        { id: 'public-water', tier: 'public', name: 'Water & drainage', subtag: 'Open manhole or waterlogging', baseSeverity: 4, evidenceType: 'photo' },
        { id: 'public-construction', tier: 'public', name: 'Construction nuisance', subtag: 'High decibel noise or heavy dust cloud', baseSeverity: 2, evidenceType: 'audio' },
        { id: 'public-junctions', tier: 'public', name: 'Unsafe junctions', subtag: 'Missing signboards or broken signal lights', baseSeverity: 4, evidenceType: 'photo' },
        { id: 'public-animals', tier: 'public', name: 'Stray animals', subtag: 'Rabid stray dogs or cows blocking traffic', baseSeverity: 3, evidenceType: 'photo' },
        { id: 'public-other', tier: 'public', name: 'Other/custom', subtag: 'Other civic nuisance or hazard', baseSeverity: 2, evidenceType: 'photo' },
      ];

      for (const cat of defaultCategories) {
        try {
          await setDoc(doc(db, 'categories', cat.id), cat);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `categories/${cat.id}`);
        }
      }
      console.log('✅ Categories seeded.');
    }
  } catch (error) {
    console.error('❌ Error seeding Firestore database:', error);
    // In case any uncaught error falls through, still wrap it
    handleFirestoreError(error, OperationType.WRITE, activePath);
  }
}

