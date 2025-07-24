import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, linkWithCredential } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, writeBatch, getDocs, setDoc, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


// Debounce function to limit how often a function is called
const debounce = (func, delay) => {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
};

// Define the main App component
const App = () => {
  // State variables for Firebase and authentication
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState(null); // User's display name
  const [userEmail, setUserEmail] = useState(null); // User's email
  const [isAuthReady, setIsAuthReady] = useState(false); // To ensure Firestore operations wait for auth

  // State variables for meal input (for adding and editing)
  const [foodItemInput, setFoodItemInput] = useState('');
  const [totalCarbsInput, setTotalCarbsInput] = useState('');
  const [fiberInput, setFiberInput] = useState('');
  const [proteinInput, setProteinInput] = useState('');
  const [fatInput, setFatInput] = useState('');
  const [mealTypeInput, setMealTypeInput] = useState('Breakfast');

  // State for editing specific meal
  const [editingMealId, setEditingMealId] = useState(null);

  // State variable for storing meals for the selected day
  const [meals, setMeals] = useState([]);

  // State variables for calculated totals
  const [netCarbsTotal, setNetCarbsTotal] = useState(0);
  const [nonNetCarbsTotal, setNonNetCarbsTotal] = useState(0);
  const [proteinTotal, setProteinTotal] = useState(0);
  const [fatTotal, setFatTotal] = useState(0);

  // State variable for loading indicator
  const [isLoading, setIsLoading] = useState(true);

  // State variables for custom modal
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalAction, setModalAction] = useState(null); // Changed to null directly

  // State for selected date (used for daily tracking and meal planning)
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());

  // State variables for weight tracking
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const [weightEntries, setWeightEntries] = useState([]);
  const [startingWeight, setStartingWeight] = useState(null);
  const [weightChange, setWeightChange] = useState(0);
  const [editingWeightId, setEditingWeightId] = useState(null);
  // State for goal weight
  const [goalWeightInput, setGoalWeightInput] = useState('');
  const [goalWeight, setGoalWeight] = useState(null);

  // New state for storing historical food item suggestions for auto-fill
  const [foodItemSuggestions, setFoodItemSuggestions] = useState({});

  // State for keto meal search input
  const [ketoSearchQuery, setKetoSearchQuery] = useState('');

  // State for daily carb goals
  const [targetNetCarbs, setTargetNetCarbs] = useState('');
  const [targetTotalCarbs, setTargetTotalCarbs] = useState('');
  const [userGoals, setUserGoals] = useState(null); // To store goals fetched from Firestore

  // State variables for water intake tracking
  const [waterIntakeInput, setWaterIntakeInput] = useState('');
  const [waterEntries, setWaterEntries] = useState([]);
  const [totalWaterToday, setTotalWaterToday] = useState(0);
  const [targetWaterIntake, setTargetWaterIntake] = useState('');
  const [userWaterGoals, setUserWaterGoals] = useState(null); // To store water goal fetched from Firestore
  const [editingWaterId, setEditingWaterId] = useState(null); // State for editing water entry

  // State variables for saved recipes
  const [recipeTitleInput, setRecipeTitleInput] = useState('');
  const [recipeUrlInput, setRecipeUrlInput] = useState('');
  const [recipeNotesInput, setRecipeNotesInput] = useState('');
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [editingRecipeId, setEditingRecipeId] = useState(null);

  // State variables for meal planning
  const [mealPlanDate, setMealPlanDate] = useState(getTodayDateString()); // Date for planning a meal
  const [selectedRecipeForPlan, setSelectedRecipeForPlan] = useState(''); // Selected saved recipe ID for planning
  const [plannedMeals, setPlannedMeals] = useState([]); // List of planned meals for the selected mealPlanDate
  const [editingPlannedMealId, setEditingPlannedMealId] = useState(null); // For editing a planned meal entry

  // State for unit system preference ('imperial' or 'metric')
  const [unitSystem, setUnitSystem] = useState('imperial'); // Default to imperial

  // State for USDA Food Search
  const [usdaSearchQuery, setUsdaSearchQuery] = useState('');
  const [usdaSearchResults, setUsdaSearchResults] = useState([]);
  const [isSearchingFood, setIsSearchingFood] = useState(false);
  const USDA_API_KEY = "T54KmPqhUzn300ephmBU2bT0T6IaWNOaUlF7eLEa"; // Provided API Key

  // Conversion Factors
  const LB_TO_KG = 0.453592;
  const KG_TO_LB = 2.20462;
  const OZ_TO_ML = 29.5735;
  const ML_TO_OZ = 0.033814;

  // Helper function to convert weight for display
  const displayWeight = (weightInLbs) => {
    if (unitSystem === 'metric') {
      return (weightInLbs * LB_TO_KG).toFixed(1);
    }
    return weightInLbs.toFixed(1);
  };

  // Helper function to get weight unit string
  const getWeightUnit = () => (unitSystem === 'metric' ? 'kg' : 'lbs');

  // Helper function to convert water for display
  const displayWater = (waterInOz) => {
    if (unitSystem === 'metric') {
      return (waterInOz * OZ_TO_ML).toFixed(1);
    }
    return waterInOz.toFixed(1);
  };

  // Helper function to get water unit string
  const getWaterUnit = () => (unitSystem === 'metric' ? 'ml' : 'oz');


  // Initialize Firebase and set up authentication
  useEffect(() => {
    try {
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

      if (!firebaseConfig) {
        console.error("Firebase config is not defined. Please ensure __firebase_config is available.");
        setIsLoading(false);
        return;
      }

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      // Function to handle initial sign-in (anonymous or custom token)
      const initialSignIn = async () => {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            // If no custom token, sign in anonymously
            await signInAnonymously(firebaseAuth);
          }
        } catch (error) {
          console.error("Firebase initial authentication error:", error);
        }
      };

      initialSignIn();

      // Listen for auth state changes
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
          setUserId(user.uid);
          setUserName(user.displayName); // Set display name
          setUserEmail(user.email);     // Set email
        } else {
          setUserId(null);
          setUserName(null);
          setUserEmail(null);
        }
        setIsAuthReady(true);
        setIsLoading(false);
      });

      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setIsLoading(false);
    }
  }, []);

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    if (!auth) {
      console.error("Firebase Auth not initialized.");
      return;
    }

    const provider = new GoogleAuthProvider();
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if there was an anonymous user before Google sign-in
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        // Link the anonymous account to the Google account
        try {
          // Get the credential from the Google sign-in result
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential) {
            await linkWithCredential(auth.currentUser, credential);
            setModalMessage("Anonymous account linked to Google successfully!");
          } else {
            setModalMessage("Signed in with Google, but no anonymous account to link.");
          }
        } catch (linkError) {
          console.error("Error linking anonymous account:", linkError);
          if (linkError.code === 'auth/credential-already-in-use') {
            setModalMessage("This Google account is already linked to another user. Please sign in with that account.");
          } else {
            setModalMessage(`Error linking account: ${linkError.message}`);
          }
        }
      } else {
        setModalMessage(`Signed in as ${user.displayName || user.email || user.uid}`);
      }
      setModalAction(null);
      setShowModal(true);

    } catch (error) {
      console.error("Google Sign-In error:", error);
      let errorMessage = error.message;
      // Specific handling for 'auth/unauthorized-domain' error
      if (error.code === 'auth/unauthorized-domain') {
        errorMessage = `Google Sign-In failed: Unauthorized domain. Please add '${window.location.hostname}' to the authorized domains list in your Firebase project settings (Authentication -> Settings -> Authorized domains).`;
      }
      setModalMessage(errorMessage);
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Sign-Out handler
  const handleSignOut = async () => {
    if (!auth) {
      console.error("Firebase Auth not initialized.");
      return;
    }
    setIsLoading(true);
    try {
      await signOut(auth);
      // After signing out, sign in anonymously again to allow continued use without explicit login
      await signInAnonymously(auth);
      setModalMessage("Successfully signed out. You are now using an anonymous session.");
      setModalAction(null);
      setShowModal(true);
    } catch (error) {
      console.error("Sign-out error:", error);
      setModalMessage(`Sign-out failed: ${error.message}`);
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };


  // Fetch user goals (carb and water), unit system, and goal weight from Firestore
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    const goalsDocRef = doc(db, `artifacts/${__app_id}/users/${userId}/settings/goals`);

    const unsubscribeGoals = onSnapshot(goalsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserGoals(data);
        setTargetNetCarbs(data.targetNetCarbs || '');
        setTargetTotalCarbs(data.targetTotalCarbs || '');
        setTargetWaterIntake(data.targetWaterIntake || '');
        setUnitSystem(data.unitSystem || 'imperial'); // Load unit system
        setGoalWeight(data.goalWeight || null); // Load goal weight
        setGoalWeightInput(data.goalWeight ? data.goalWeight.toString() : ''); // Set input field
      } else {
        setUserGoals(null);
        setTargetNetCarbs('');
        setTargetTotalCarbs('');
        setTargetWaterIntake('');
        setUnitSystem('imperial'); // Default if no settings exist
        setGoalWeight(null);
        setGoalWeightInput('');
      }
    }, (error) => {
      console.error("Error fetching user goals:", error);
    });

    return () => unsubscribeGoals();
  }, [db, userId, isAuthReady]);

  // Save user goals (carb and water), unit system, and goal weight to Firestore
  const handleSaveGoals = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      setModalMessage("Authentication required to save goals. Please sign in.");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    const netCarbs = parseFloat(targetNetCarbs);
    const totalCarbs = parseFloat(targetTotalCarbs);
    const waterIntake = parseFloat(targetWaterIntake);
    const goalWeightValue = parseFloat(goalWeightInput); // Parse goal weight input

    if ((targetNetCarbs !== '' && (isNaN(netCarbs) || netCarbs < 0)) ||
        (targetTotalCarbs !== '' && (isNaN(totalCarbs) || totalCarbs < 0)) ||
        (targetWaterIntake !== '' && (isNaN(waterIntake) || waterIntake < 0)) ||
        (goalWeightInput !== '' && (isNaN(goalWeightValue) || goalWeightValue <= 0))) { // Validate goal weight
      setModalMessage("Please enter valid non-negative numbers for all goals and a positive number for goal weight.");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    setIsLoading(true);
    try {
      // Convert goalWeight to lbs for storage if metric is selected
      const goalWeightToSave = unitSystem === 'metric' && goalWeightInput !== ''
        ? goalWeightValue * KG_TO_LB
        : (goalWeightInput !== '' ? goalWeightValue : null);

      // Use setDoc with merge: true to create the document if it doesn't exist, or update it if it does.
      await setDoc(doc(db, `artifacts/${__app_id}/users/${userId}/settings/goals`), {
        targetNetCarbs: targetNetCarbs !== '' ? netCarbs : null,
        targetTotalCarbs: targetTotalCarbs !== '' ? totalCarbs : null,
        targetWaterIntake: targetWaterIntake !== '' ? waterIntake : null,
        unitSystem: unitSystem, // Save unit system
        goalWeight: goalWeightToSave, // Save goal weight in lbs
      }, { merge: true });
      setModalMessage("Goals and settings saved successfully!");
      setModalAction(null);
      setShowModal(true);
    } catch (e) {
      console.error("Error saving goals:", e);
      let errorMessage = "Failed to save goals and settings. Please try again.";
      if (e.code) {
        errorMessage += ` (Error Code: ${e.code})`;
      }
      setModalMessage(errorMessage);
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };


  // Fetch meals from Firestore in real-time based on selected date
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    setIsLoading(true);

    // Parse selectedDate string into year, month, day
    const [year, month, day] = selectedDate.split('-').map(Number);

    // Create a Date object for the start of the selected day in the local timezone
    const startOfSelectedDay = new Date(year, month - 1, day, 0, 0, 0, 0); // Month is 0-indexed

    // Create a Date object for the end of the selected day in the local timezone (exclusive for query)
    const endOfSelectedDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Start of next day

    const startOfDayTimestamp = Timestamp.fromMillis(startOfSelectedDay.getTime());
    const endOfDayTimestamp = Timestamp.fromMillis(endOfSelectedDay.getTime());

    console.log("Querying meals for date:", selectedDate);
    console.log("Query range - start (Firestore Timestamp):", startOfDayTimestamp);
    console.log("Query range - start (milliseconds):", startOfDayTimestamp.toMillis());
    console.log("Query range - end (Firestore Timestamp, exclusive):", endOfDayTimestamp);
    console.log("Query range - end (milliseconds, exclusive):", endOfDayTimestamp.toMillis());


    const mealsCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`);
    const q = query(
      mealsCollectionRef,
      where('timestamp', '>=', startOfDayTimestamp),
      where('timestamp', '<', endOfDayTimestamp)
    );

    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const fetchedMeals = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log("Timestamp of fetched meal:", data.timestamp); // Log the timestamp of each fetched meal
        fetchedMeals.push({ id: doc.id, ...data });
      });
      console.log("Fetched meals from Firestore:", fetchedMeals); // Log fetched meals
      setMeals(fetchedMeals);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching meals:", error);
      setIsLoading(false);
    });

    return () => unsubscribeSnapshot();
  }, [db, userId, isAuthReady, selectedDate]);

  // Fetch all historical meal data for auto-fill suggestions
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    const allMealsCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`);

    const unsubscribeAllMealsSnapshot = onSnapshot(allMealsCollectionRef, (snapshot) => {
      const suggestionsMap = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        suggestionsMap[data.foodItem.toLowerCase()] = {
          totalCarbs: data.totalCarbs,
          fiber: data.fiber,
          protein: data.protein || '',
          fat: data.fat || ''
        };
      });
      setFoodItemSuggestions(suggestionsMap);
    }, (error) => {
      console.error("Error fetching all meal history for suggestions:", error);
    });

    return () => unsubscribeAllMealsSnapshot();
  }, [db, userId, isAuthReady]);

  // Fetch weight entries from Firestore in real-time
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    const weightCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/weightEntries`);
    const q = query(weightCollectionRef);

    const unsubscribeWeightSnapshot = onSnapshot(q, (snapshot) => {
      const fetchedWeights = [];
      snapshot.forEach((doc) => {
        fetchedWeights.push({ id: doc.id, ...doc.data() });
      });
      // Ensure timestamp is a number for sorting if it's a Firestore Timestamp object
      fetchedWeights.sort((a, b) => (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp) - (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp));
      setWeightEntries(fetchedWeights);

      if (fetchedWeights.length > 0) {
        setStartingWeight(fetchedWeights[0].weight);
        setWeightChange(fetchedWeights[fetchedWeights.length - 1].weight - fetchedWeights[0].weight);
      } else {
        setStartingWeight(null);
        setWeightChange(0);
      }
    }, (error) => {
      console.error("Error fetching weight entries:", error);
    });

    return () => unsubscribeWeightSnapshot();
  }, [db, userId, isAuthReady]);

  // Fetch water entries from Firestore in real-time based on selected date
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    // Parse selectedDate string into year, month, day
    const [year, month, day] = selectedDate.split('-').map(Number);

    // Create a Date object for the start of the selected day in the local timezone
    const startOfSelectedDay = new Date(year, month - 1, day, 0, 0, 0, 0); // Month is 0-indexed

    // Create a Date object for the end of the selected day in the local timezone (exclusive for query)
    const endOfSelectedDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Start of next day

    const startOfDayTimestamp = Timestamp.fromMillis(startOfSelectedDay.getTime());
    const endOfDayTimestamp = Timestamp.fromMillis(endOfSelectedDay.getTime());

    const waterCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/waterEntries`);
    const q = query(
      waterCollectionRef,
      where('timestamp', '>=', startOfDayTimestamp),
      where('timestamp', '<', endOfDayTimestamp)
    );

    const unsubscribeWaterSnapshot = onSnapshot(q, (snapshot) => {
      const fetchedWater = [];
      let currentTotalWater = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedWater.push({ id: doc.id, ...data });
        currentTotalWater += parseFloat(data.amount) || 0;
      });
      console.log("Fetched water entries from Firestore:", fetchedWater); // Log fetched water
      setWaterEntries(fetchedWater);
      setTotalWaterToday(currentTotalWater);
      console.log("Calculated total water today:", currentTotalWater); // Log calculated total water
    }, (error) => {
      console.error("Error fetching water entries:", error);
    });

    return () => unsubscribeWaterSnapshot();
  }, [db, userId, isAuthReady, selectedDate]);

  // Fetch saved recipes from Firestore in real-time
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    const recipesCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/savedRecipes`);
    const q = query(recipesCollectionRef);

    const unsubscribeRecipesSnapshot = onSnapshot(q, (snapshot) => {
      const fetchedRecipes = [];
      snapshot.forEach((doc) => {
        fetchedRecipes.push({ id: doc.id, ...doc.data() });
      });
      fetchedRecipes.sort((a, b) => (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp) - (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp)); // Sort by when they were saved
      setSavedRecipes(fetchedRecipes);
    }, (error) => {
      console.error("Error fetching saved recipes:", error);
    });

    return () => unsubscribeRecipesSnapshot();
  }, [db, userId, isAuthReady]);

  // Fetch planned meals from Firestore based on mealPlanDate
  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      return;
    }

    // Parse mealPlanDate string into year, month, day
    const [year, month, day] = mealPlanDate.split('-').map(Number);

    // Create a Date object for the start of the selected day in the local timezone
    const startOfPlannedDay = new Date(year, month - 1, day, 0, 0, 0, 0); // Month is 0-indexed

    // Create a Date object for the end of the selected day in the local timezone (exclusive for query)
    const endOfPlannedDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Start of next day

    const startOfDayTimestamp = Timestamp.fromMillis(startOfPlannedDay.getTime());
    const endOfDayTimestamp = Timestamp.fromMillis(endOfPlannedDay.getTime());

    const mealPlansCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/mealPlans`);
    const q = query(
      mealPlansCollectionRef,
      where('dateTimestamp', '>=', startOfDayTimestamp),
      where('dateTimestamp', '<', endOfDayTimestamp)
    );

    const unsubscribePlannedMeals = onSnapshot(q, (snapshot) => {
      const fetchedPlannedMeals = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const recipe = savedRecipes.find(r => r.id === data.recipeId);
        if (recipe) {
          fetchedPlannedMeals.push({ id: docSnap.id, ...data, recipeDetails: recipe });
        } else {
          // If the linked recipe is no longer available, consider cleaning up or showing a warning
          console.warn(`Planned meal for ${data.date} references a non-existent recipe ID: ${data.recipeId}`);
        }
      });
      setPlannedMeals(fetchedPlannedMeals);
    }, (error) => {
      console.error("Error fetching planned meals:", error);
    });

    return () => unsubscribePlannedMeals();
  }, [db, userId, isAuthReady, mealPlanDate, savedRecipes]); // Re-fetch if savedRecipes change to update details


  // Calculate totals whenever meals change
  useEffect(() => {
    console.log("Meals state changed, recalculating totals. Current meals:", meals); // Added log
    let currentNetCarbs = 0;
    let currentNonNetCarbs = 0;
    let currentProteinTotal = 0;
    let currentFatTotal = 0;

    // Ensure meals is an array before iterating
    if (Array.isArray(meals)) {
      meals.forEach(meal => {
        const totalCarbs = parseFloat(meal.totalCarbs) || 0;
        const fiber = parseFloat(meal.fiber) || 0;
        const protein = parseFloat(meal.protein) || 0;
        const fat = parseFloat(meal.fat) || 0;

        currentNetCarbs += (totalCarbs - fiber);
        currentNonNetCarbs += totalCarbs;
        currentProteinTotal += protein;
        currentFatTotal += fat;
      });
    } else {
      console.warn("Meals is not an array when attempting to calculate totals:", meals); // Added warning
    }

    setNetCarbsTotal(currentNetCarbs);
    setNonNetCarbsTotal(currentNonNetCarbs);
    setProteinTotal(currentProteinTotal);
    setFatTotal(currentFatTotal);
    console.log("Calculated meal totals:", { netCarbsTotal: currentNetCarbs, nonNetCarbsTotal: currentNonNetCarbs, proteinTotal: currentProteinTotal, fatTotal: currentFatTotal }); // Log calculated meal totals
  }, [meals]);

  // Debounced function to check food item and auto-fill carbs/fiber/protein/fat
  const checkFoodItemForAutoFill = useCallback(
    debounce((foodName) => {
      if (foodName.trim() === '') {
        setTotalCarbsInput('');
        setFiberInput('');
        setProteinInput('');
        setFatInput('');
        return;
      }
      const lowerCaseFoodName = foodName.toLowerCase();
      if (foodItemSuggestions[lowerCaseFoodName]) {
        const suggestion = foodItemSuggestions[lowerCaseFoodName];
        setTotalCarbsInput(suggestion.totalCarbs);
        setFiberInput(suggestion.fiber);
        setProteinInput(suggestion.protein);
        setFatInput(suggestion.fat);
      } else {
        if (!editingMealId) {
          setTotalCarbsInput('');
          setFiberInput('');
          setProteinInput('');
          setFatInput('');
        }
      }
    }, 300),
    [foodItemSuggestions, editingMealId]
  );

  // Debounced function to search USDA FoodData Central
  const searchFoodDataCentral = useCallback(
    debounce(async (query) => {
      if (query.trim() === '') {
        setUsdaSearchResults([]);
        setIsSearchingFood(false);
        return;
      }

      setIsSearchingFood(true);
      setUsdaSearchResults([]); // Clear previous results
      try {
        const response = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=10`
        );
        const data = await response.json();

        if (data.foods) {
          const formattedResults = data.foods.map(food => {
            const totalCarbs = food.foodNutrients?.find(n => n.nutrientName === 'Carbohydrate, by difference')?.value || 0;
            const fiber = food.foodNutrients?.find(n => n.nutrientName === 'Fiber, total dietary')?.value || 0;
            const protein = food.foodNutrients?.find(n => n.nutrientName === 'Protein')?.value || 0;
            const fat = food.foodNutrients?.find(n => n.nutrientName === 'Total lipid (fat)')?.value || 0;

            return {
              fdcId: food.fdcId,
              description: food.description,
              totalCarbs: totalCarbs,
              fiber: fiber,
              protein: protein,
              fat: fat,
              dataType: food.dataType,
            };
          });
          setUsdaSearchResults(formattedResults);
        } else {
          setUsdaSearchResults([]);
        }
      } catch (error) {
        console.error("Error fetching from USDA API:", error);
        setModalMessage("Failed to fetch food data. Please try again later.");
        setModalAction(null);
        setShowModal(true);
        setUsdaSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 500), // Debounce for 500ms
    [] // No dependencies as USDA_API_KEY is constant
  );

  // Handle selection from USDA search results
  const handleUsdaResultSelect = (food) => {
    setFoodItemInput(food.description);
    setTotalCarbsInput(food.totalCarbs);
    setFiberInput(food.fiber);
    setProteinInput(food.protein);
    setFatInput(food.fat);
    setUsdaSearchQuery(''); // Clear search query
    setUsdaSearchResults([]); // Clear search results
  };

  // Function to handle adding or updating a meal
  const handleAddOrUpdateMeal = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    const totalCarbs = parseFloat(totalCarbsInput);
    const fiber = parseFloat(fiberInput);
    const protein = parseFloat(proteinInput);
    const fat = parseFloat(fatInput);

    if (!foodItemInput || isNaN(totalCarbs) || isNaN(fiber) || isNaN(protein) || isNaN(fat) ||
        totalCarbs < 0 || fiber < 0 || protein < 0 || fat < 0) {
      setModalMessage("Please enter a valid food item, total carbs, fiber, protein, and fat (non-negative numbers).");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const mealData = {
        foodItem: foodItemInput,
        totalCarbs: totalCarbs,
        fiber: fiber,
        protein: protein,
        fat: fat,
        mealType: mealTypeInput,
      };

      if (editingMealId) {
        await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`, editingMealId), mealData);
        setEditingMealId(null);
        console.log("Meal updated:", mealData); // Log updated meal
      } else {
        mealData.timestamp = Timestamp.now(); // Use Firestore Timestamp for saving
        console.log("Adding meal with timestamp (Firestore Timestamp object):", mealData.timestamp); // Log the Timestamp object
        console.log("Adding meal with timestamp (milliseconds):", mealData.timestamp.toMillis()); // Log milliseconds for debugging
        console.log("Current local time when adding meal:", new Date().toLocaleString()); // Log current local time

        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`), mealData);
        console.log("Meal added:", mealData); // Log added meal
      }

      setFoodItemInput('');
      setTotalCarbsInput('');
      setFiberInput('');
      setProteinInput('');
      setFatInput('');
      setMealTypeInput('Breakfast');
    } catch (e) {
      console.error("Error adding/updating document: ", e);
      setModalMessage("Failed to save meal. Please try again.");
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to set up meal for editing
  const handleEditMealClick = (meal) => {
    setEditingMealId(meal.id);
    setFoodItemInput(meal.foodItem);
    setTotalCarbsInput(meal.totalCarbs);
    setFiberInput(meal.fiber);
    setProteinInput(meal.protein || '');
    setFatInput(meal.fat || '');
    setMealTypeInput(meal.mealType || 'Breakfast');
  };

  // Function to cancel meal editing
  const handleCancelMealEdit = () => {
    setEditingMealId(null);
    setFoodItemInput('');
    setTotalCarbsInput('');
    setFiberInput('');
    setProteinInput('');
    setFatInput('');
    setMealTypeInput('Breakfast');
  };

  // Function to handle deleting a single meal
  const handleDeleteMeal = async (mealId) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage("Are you sure you want to delete this meal?");
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        await deleteDoc(doc(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`, mealId));
      } catch (e) {
        console.error("Error deleting document: ", e);
        setModalMessage("Failed to delete meal. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle clearing all meals for the selected day
  const handleClearDay = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage(`Are you sure you want to clear all meals for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}? This action cannot be undone.`);
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        // Parse selectedDate string into year, month, day
        const [year, month, day] = selectedDate.split('-').map(Number);

        // Create a Date object for the start of the selected day in the local timezone
        const startOfSelectedDay = new Date(year, month - 1, day, 0, 0, 0, 0); // Month is 0-indexed

        // Create a Date object for the end of the selected day in the local timezone (exclusive for query)
        const endOfSelectedDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Start of next day

        const startOfDayTimestamp = Timestamp.fromMillis(startOfSelectedDay.getTime());
        const endOfDayTimestamp = Timestamp.fromMillis(endOfSelectedDay.getTime());

        const mealsCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`);
        const q = query(
          mealsCollectionRef,
          where('timestamp', '>=', startOfDayTimestamp),
          where('timestamp', '<', endOfDayTimestamp)
        );

        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);

        querySnapshot.forEach((document) => {
          batch.delete(doc(db, `artifacts/${__app_id}/users/${userId}/carbTrackerMeals`, document.id));
        });

        await batch.commit();
        setMeals([]);
      } catch (e) {
        console.error("Error clearing meals for the day: ", e);
        setModalMessage("Failed to clear meals. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle adding or updating a weight entry
  const handleAddOrUpdateWeight = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    let weightToSave = parseFloat(currentWeightInput);

    if (isNaN(weightToSave) || weightToSave <= 0) {
      setModalMessage(`Please enter a valid positive weight in ${getWeightUnit()}.`);
      setModalAction(null);
      setShowModal(true);
      return;
    }

    // Convert to lbs for storage if metric is selected
    if (unitSystem === 'metric') {
      weightToSave = weightToSave * KG_TO_LB;
    }

    setIsLoading(true);
    try {
      if (editingWeightId) {
        await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/weightEntries`, editingWeightId), {
          weight: weightToSave,
        });
        setEditingWeightId(null);
      } else {
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/weightEntries`), {
          weight: weightToSave,
          timestamp: Timestamp.now(), // Use Firestore Timestamp
        });
      }
      setCurrentWeightInput('');
    } catch (e) {
      console.error("Error adding/updating weight entry: ", e);
      setModalMessage("Failed to save weight. Please try again.");
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to set up weight for editing
  const handleEditWeightClick = (entry) => {
    setEditingWeightId(entry.id);
    // Convert from lbs (stored) to display units
    setCurrentWeightInput(unitSystem === 'metric' ? (entry.weight * LB_TO_KG).toFixed(1) : entry.weight.toFixed(1));
  };

  // Function to cancel weight editing
  const handleCancelWeightEdit = () => {
    setEditingWeightId(null);
    setCurrentWeightInput('');
  };

  // Function to handle deleting a single weight entry
  const handleDeleteWeight = async (weightId) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage("Are you sure you want to delete this weight entry?");
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        await deleteDoc(doc(db, `artifacts/${__app_id}/users/${userId}/weightEntries`, weightId));
      } catch (e) {
        console.error("Error deleting weight entry: ", e);
        setModalMessage("Failed to delete weight entry. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle clearing all weight entries
  const handleClearAllWeights = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage("Are you sure you want to clear ALL weight entries? This action cannot be undone.");
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        const weightCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/weightEntries`);
        const querySnapshot = await getDocs(query(weightCollectionRef));
        const batch = writeBatch(db);

        querySnapshot.forEach((document) => {
          batch.delete(doc(db, `artifacts/${__app_id}/users/${userId}/weightEntries`, document.id));
        });

        await batch.commit();
        setWeightEntries([]);
      } catch (e) {
        console.error("Error clearing all weight entries: ", e);
        setModalMessage("Failed to clear all weight entries. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle adding or updating a water entry
  const handleAddOrUpdateWater = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    let amountToSave = parseFloat(waterIntakeInput);

    if (isNaN(amountToSave) || amountToSave <= 0) {
      setModalMessage(`Please enter a valid positive amount for water intake in ${getWaterUnit()}.`);
      setModalAction(null);
      setShowModal(true);
      return;
    }

    // Convert to oz for storage if metric is selected
    if (unitSystem === 'metric') {
      amountToSave = amountToSave * ML_TO_OZ;
    }

    setIsLoading(true);
    try {
      const waterData = {
        amount: amountToSave,
      };

      if (editingWaterId) {
        await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/waterEntries`, editingWaterId), waterData);
        setEditingWaterId(null);
        console.log("Water entry updated:", waterData); // Log updated water entry
      } else {
        waterData.timestamp = Timestamp.now(); // Use Firestore Timestamp
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/waterEntries`), waterData);
        console.log("Water entry added:", waterData); // Log added water entry
      }
      setWaterIntakeInput('');
    } catch (e) {
      console.error("Error adding/updating water entry: ", e);
      setModalMessage("Failed to save water intake. Please try again.");
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to set up water for editing
  const handleEditWaterClick = (entry) => {
    setEditingWaterId(entry.id);
    // Convert from oz (stored) to display units
    setWaterIntakeInput(unitSystem === 'metric' ? (entry.amount * OZ_TO_ML).toFixed(1) : entry.amount.toFixed(1));
  };

  // Function to cancel water editing
  const handleCancelWaterEdit = () => {
    setEditingWaterId(null);
    setWaterIntakeInput('');
  };

  // Function to handle deleting a single water entry
  const handleDeleteWater = async (waterId) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage("Are you sure you want to delete this water entry?");
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        await deleteDoc(doc(db, `artifacts/${__app_id}/users/${userId}/waterEntries`, waterId));
      } catch (e) {
        console.error("Error deleting water entry: ", e);
        setModalMessage("Failed to delete water entry. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle clearing all water entries for the selected day
  const handleClearWaterDay = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage(`Are you sure you want to clear all water entries for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}? This action cannot be undone.`);
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        // Parse selectedDate string into year, month, day
        const [year, month, day] = selectedDate.split('-').map(Number);

        // Create a Date object for the start of the selected day in the local timezone
        const startOfSelectedDay = new Date(year, month - 1, day, 0, 0, 0, 0); // Month is 0-indexed

        // Create a Date object for the end of the selected day in the local timezone (exclusive for query)
        const endOfSelectedDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Start of next day

        const startOfDayTimestamp = Timestamp.fromMillis(startOfSelectedDay.getTime());
        const endOfDayTimestamp = Timestamp.fromMillis(endOfSelectedDay.getTime());

        const waterCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/waterEntries`);
        const q = query(
          waterCollectionRef,
          where('timestamp', '>=', startOfDayTimestamp),
          where('timestamp', '<', endOfDayTimestamp)
        );

        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);

        querySnapshot.forEach((document) => {
          batch.delete(doc(db, `artifacts/${__app_id}/users/${userId}/waterEntries`, document.id));
        });

        await batch.commit();
        setWaterEntries([]);
      } catch (e) {
        console.error("Error clearing water for the day: ", e);
        setModalMessage("Failed to clear water entries. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle adding or updating a saved recipe
  const handleAddOrUpdateRecipe = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    if (!recipeTitleInput.trim() || !recipeUrlInput.trim()) {
      setModalMessage("Please enter a recipe title and URL.");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    // Basic URL validation
    try {
      new URL(recipeUrlInput);
    } catch (_) {
      setModalMessage("Please enter a valid URL for the recipe.");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const recipeData = {
        title: recipeTitleInput.trim(),
        url: recipeUrlInput.trim(),
        notes: recipeNotesInput.trim(),
      };

      if (editingRecipeId) {
        await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/savedRecipes`, editingRecipeId), recipeData);
        setEditingRecipeId(null);
      } else {
        recipeData.timestamp = Timestamp.now(); // Use Firestore Timestamp
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/savedRecipes`), recipeData);
      }
      setRecipeTitleInput('');
      setRecipeUrlInput('');
      setRecipeNotesInput('');
    } catch (e) {
      console.error("Error adding/updating recipe: ", e);
      setModalMessage("Failed to save recipe. Please try again.");
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to set up recipe for editing
  const handleEditRecipeClick = (recipe) => {
    setEditingRecipeId(recipe.id);
    setRecipeTitleInput(recipe.title);
    setRecipeUrlInput(recipe.url);
    setRecipeNotesInput(recipe.notes || '');
  };

  // Function to cancel recipe editing
  const handleCancelRecipeEdit = () => {
    setEditingRecipeId(null);
    setRecipeTitleInput('');
    setRecipeUrlInput('');
    setRecipeNotesInput('');
  };

  // Function to handle deleting a saved recipe
  const handleDeleteRecipe = async (recipeId) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage("Are you sure you want to delete this recipe?");
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        await deleteDoc(doc(db, `artifacts/${__app_id}/users/${userId}/savedRecipes`, recipeId));
        // Also remove any planned meals that use this recipe
        const mealPlansCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/mealPlans`);
        const q = query(mealPlansCollectionRef, where('recipeId', '==', recipeId));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        querySnapshot.forEach((document) => {
          batch.delete(doc(db, `artifacts/${__app_id}/users/${userId}/mealPlans`, document.id));
        });
        await batch.commit();
      } catch (e) {
        console.error("Error deleting recipe: ", e);
        setModalMessage("Failed to delete recipe. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle adding or updating a planned meal
  const handleAddOrUpdatePlannedMeal = async () => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    if (!selectedRecipeForPlan || !mealPlanDate) {
      setModalMessage("Please select a recipe and a date to plan a meal.");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    // Ensure only one meal can be planned per day for simplicity
    if (plannedMeals.length > 0 && !editingPlannedMealId) {
      setModalMessage("Only one meal can be planned per day. Please edit the existing one or clear it first.");
      setModalAction(null);
      setShowModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const plannedMealData = {
        recipeId: selectedRecipeForPlan,
        date: mealPlanDate, // Store as YYYY-MM-DD string
        dateTimestamp: Timestamp.fromMillis(new Date(mealPlanDate).setHours(0, 0, 0, 0)), // Store as timestamp for querying
      };

      if (editingPlannedMealId) {
        await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/mealPlans`, editingPlannedMealId), plannedMealData);
        setEditingPlannedMealId(null);
      } else {
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/mealPlans`), plannedMealData);
      }
      setSelectedRecipeForPlan(''); // Clear selected recipe
    } catch (e) {
      console.error("Error adding/updating planned meal: ", e);
      setModalMessage("Failed to save planned meal. Please try again.");
      setModalAction(null);
      setShowModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to set up planned meal for editing
  const handleEditPlannedMealClick = (plannedMeal) => {
    setEditingPlannedMealId(plannedMeal.id);
    setMealPlanDate(plannedMeal.date);
    setSelectedRecipeForPlan(plannedMeal.recipeId);
  };

  // Function to cancel planned meal editing
  const handleCancelPlannedMealEdit = () => {
    setEditingPlannedMealId(null);
    setSelectedRecipeForPlan('');
    setMealPlanDate(getTodayDateString()); // Reset to today's date
  };

  // Function to delete a planned meal
  const handleDeletePlannedMeal = async (plannedMealId) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    setModalMessage("Are you sure you want to remove this planned meal?");
    setModalAction(() => async () => {
      setIsLoading(true);
      try {
        await deleteDoc(doc(db, `artifacts/${__app_id}/users/${userId}/mealPlans`, plannedMealId));
      } catch (e) {
        console.error("Error deleting planned meal: ", e);
        setModalMessage("Failed to remove planned meal. Please try again.");
        setModalAction(null);
        setShowModal(true);
      } finally {
        setIsLoading(false);
        setShowModal(false);
      }
    });
    setShowModal(true);
  };

  // Function to handle opening a Google search for keto meals
  const handleKetoSearch = (queryText) => {
    const baseUrl = "https://www.google.com/search?q=";
    const fullQuery = encodeURIComponent(`keto meals ${queryText}`);
    window.open(baseUrl + fullQuery, '_blank');
  };

  // Custom Modal Component
  const ConfirmationModal = ({ message, onConfirm, onCancel, show }) => {
    if (!show) return null;

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center">
          <p className="text-lg font-semibold mb-4">{message}</p>
          <div className="flex justify-center space-x-4">
            {onConfirm && (
              <button
                onClick={() => { onConfirm(); setShowModal(false); }}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition duration-200"
              >
                Confirm
              </button>
            )}
            <button
              onClick={() => { onCancel ? onCancel() : setShowModal(false); }}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition duration-200"
            >
              {onConfirm ? 'Cancel' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Prepare data for the weight chart
  const chartData = Array.isArray(weightEntries) ? weightEntries.map(entry => ({
    date: new Date(entry.timestamp.toMillis ? entry.timestamp.toMillis() : entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: displayWeight(entry.weight), // Convert weight for chart display
  })) : []; // Provide an empty array as fallback


  // Calculate remaining weight to goal
  const latestWeight = Array.isArray(weightEntries) && weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight : null;
  const remainingToGoal = (goalWeight && latestWeight) ? (latestWeight - goalWeight) : null;


  if (isLoading && !db) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <div className="text-xl text-gray-700">Loading application...</div>
      </div>
    );
  }

  // Calculate progress for carb goals
  const netCarbsProgress = userGoals?.targetNetCarbs ? (netCarbsTotal / userGoals.targetNetCarbs) * 100 : 0;
  const totalCarbsProgress = userGoals?.targetTotalCarbs ? (nonNetCarbsTotal / userGoals.targetTotalCarbs) * 100 : 0;
  const waterProgress = userGoals?.targetWaterIntake ? (totalWaterToday / userGoals.targetWaterIntake) * 100 : 0;

  // Group meals by mealType
  const groupedMeals = Array.isArray(meals) ? meals.reduce((acc, meal) => {
    const type = meal.mealType || 'Other';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(meal);
    return acc;
  }, {}) : {};

  // Define the order of meal types for display
  const mealTypeOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Other'];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-4 font-inter text-gray-800">
      <style>
        {`
          /* Removed Google Fonts import due to CSP */
          body {
            font-family: 'Inter', sans-serif; /* Fallback to system font if Inter is not available */
          }
        `}
      </style>

      <h1 className="text-4xl font-bold text-blue-700 mb-6 text-center">Carb & Weight Tracker</h1>

      {/* Authentication Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Authentication</h2>
        {userId && (
          <p className="text-sm text-gray-600 mb-2">
            Logged in as: <span className="font-semibold">{userName || userEmail || 'Anonymous'}</span>
            <br />
            User ID: <span className="font-mono bg-gray-200 px-2 py-1 rounded-md text-xs">{userId}</span>
          </p>
        )}
        <div className="flex flex-col space-y-3">
          {!userName && !userEmail && ( // Only show Google Sign-In if not already signed in with Google
            <button
              onClick={handleGoogleSignIn}
              className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition duration-200 shadow-md flex items-center justify-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.27c-.24 0-.48-.02-.72-.04C10.7 8.91 9.77 8 8.6 8c-2.43 0-4.4 1.97-4.4 4.4s1.97 4.4 4.4 4.4c1.17 0 2.1-.91 2.92-1.92l.72.04c.24.02.48.04.72.04 2.43 0 4.4-1.97 4.4-4.4s-1.97-4.4-4.4-4.4zm0 6.6c-1.21 0-2.2-1.01-2.2-2.25s.99-2.25 2.2-2.25 2.2 1.01 2.2 2.25-.99 2.25-2.2 2.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              <span>Sign In with Google</span>
            </button>
          )}
          {userName && ( // Only show Sign Out if signed in with Google
            <button
              onClick={handleSignOut}
              className="w-full bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition duration-200 shadow-md"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>


      {/* Daily Goals Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Daily Goals & Settings</h2>
        <div className="grid grid-cols-1 gap-4 mb-4">
          {/* Unit System Selector */}
          <div className="flex items-center space-x-4 p-3 border border-gray-300 rounded-lg">
            <span className="font-medium text-gray-700">Unit System:</span>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-blue-600 h-5 w-5"
                name="unitSystem"
                value="imperial"
                checked={unitSystem === 'imperial'}
                onChange={() => setUnitSystem('imperial')}
              />
              <span className="ml-2 text-gray-700">Imperial (lbs, oz)</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-blue-600 h-5 w-5"
                name="unitSystem"
                value="metric"
                checked={unitSystem === 'metric'}
                onChange={() => setUnitSystem('metric')}
              />
              <span className="ml-2 text-gray-700">Metric (kg, ml)</span>
            </label>
          </div>

          <input
            type="number"
            placeholder="Target Net Carbs (g)"
            value={targetNetCarbs}
            onChange={(e) => setTargetNetCarbs(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <input
            type="number"
            placeholder="Target Total Carbs (g)"
            value={targetTotalCarbs}
            onChange={(e) => setTargetTotalCarbs(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <input
            type="number"
            placeholder={`Target Water Intake (${getWaterUnit()})`}
            value={targetWaterIntake}
            onChange={(e) => setTargetWaterIntake(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          {/* Goal Weight Input */}
          <input
            type="number"
            placeholder={`Goal Weight (${getWeightUnit()})`}
            value={goalWeightInput}
            onChange={(e) => setGoalWeightInput(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <button
            onClick={handleSaveGoals}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition duration-200 shadow-md"
            disabled={!userId || !db}
          >
            Save Goals & Settings
          </button>
        </div>
        {userGoals && (userGoals.targetNetCarbs || userGoals.targetTotalCarbs || userGoals.targetWaterIntake || userGoals.goalWeight) && (
          <div className="space-y-3 mt-4">
            {userGoals.targetNetCarbs && (
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="font-medium text-green-800">Net Carbs Goal: {userGoals.targetNetCarbs}g</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                  <div
                    className="bg-green-600 h-2.5 rounded-full"
                    style={{ width: `${Math.min(100, netCarbsProgress)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  Progress: {netCarbsTotal.toFixed(1)}g / {userGoals.targetNetCarbs}g ({netCarbsProgress.toFixed(1)}%)
                </p>
              </div>
            )}
            {userGoals.targetTotalCarbs && (
              <div className="bg-purple-50 p-3 rounded-lg">
                <p className="font-medium text-purple-800">Total Carbs Goal: {userGoals.targetTotalCarbs}g</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                  <div
                    className="bg-purple-600 h-2.5 rounded-full"
                    style={{ width: `${Math.min(100, totalCarbsProgress)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  Progress: {nonNetCarbsTotal.toFixed(1)}g / {userGoals.targetTotalCarbs}g ({totalCarbsProgress.toFixed(1)}%)
                </p>
              </div>
            )}
            {userGoals.targetWaterIntake && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="font-medium text-blue-800">Water Goal: {displayWater(userGoals.targetWaterIntake)}{getWaterUnit()}</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${Math.min(100, waterProgress)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  Progress: {displayWater(totalWaterToday)}{getWaterUnit()} / {displayWater(userGoals.targetWaterIntake)}{getWaterUnit()} ({waterProgress.toFixed(1)}%)
                </p>
              </div>
            )}
            {userGoals.goalWeight && (
              <div className="bg-orange-50 p-3 rounded-lg">
                <p className="font-medium text-orange-800">Goal Weight: {displayWeight(userGoals.goalWeight)}{getWeightUnit()}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date Selection */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">View Data for:</h2>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 text-lg"
        />
        <p className="text-center text-gray-600 mt-3">
          Showing data for <span className="font-semibold">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </p>
      </div>

      {/* Input Section - Only visible for today's date */}
      {selectedDate === getTodayDateString() && (
        <>
          {/* USDA Food Search Section */}
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">Search & Auto-fill Food</h2>
            <input
              type="text"
              placeholder="Search food (e.g., 'apple', 'chicken breast')"
              value={usdaSearchQuery}
              onChange={(e) => {
                setUsdaSearchQuery(e.target.value);
                searchFoodDataCentral(e.target.value);
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200 mb-4"
            />
            {isSearchingFood && (
              <p className="text-center text-green-600 mb-2">Searching...</p>
            )}
            {usdaSearchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50">
                <ul className="divide-y divide-gray-200">
                  {usdaSearchResults.map((food) => (
                    <li
                      key={food.fdcId}
                      onClick={() => handleUsdaResultSelect(food)}
                      className="p-3 hover:bg-green-100 cursor-pointer transition duration-150 ease-in-out"
                    >
                      <p className="font-semibold text-gray-800">{food.description}</p>
                      <p className="text-sm text-gray-600">
                        Carbs: {food.totalCarbs}g, Fiber: {food.fiber}g, Protein: {food.protein}g, Fat: {food.fat}g
                      </p>
                      <p className="text-xs text-gray-500">Data Type: {food.dataType}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {usdaSearchQuery.length > 0 && !isSearchingFood && usdaSearchResults.length === 0 && (
              <p className="text-center text-gray-500 mt-2">No results found for "{usdaSearchQuery}".</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">
              {editingMealId ? 'Edit Meal' : 'Add New Meal (Today)'}
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <input
                type="text"
                placeholder="Food Item (e.g., Avocado, Chicken)"
                value={foodItemInput}
                onChange={(e) => {
                  setFoodItemInput(e.target.value);
                  // No need to call checkFoodItemForAutoFill here anymore if USDA search is primary
                  // checkFoodItemForAutoFill(e.target.value);
                }}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              />
              <select
                value={mealTypeInput}
                onChange={(e) => setMealTypeInput(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              >
                <option value="Breakfast">Breakfast</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
                <option value="Snack">Snack</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="number"
                placeholder="Total Carbs (grams)"
                value={totalCarbsInput}
                onChange={(e) => setTotalCarbsInput(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              />
              <input
                type="number"
                placeholder="Fiber (grams)"
                value={fiberInput}
                onChange={(e) => setFiberInput(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              />
              <input
                type="number"
                placeholder="Protein (grams)"
                value={proteinInput}
                onChange={(e) => setProteinInput(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              />
              <input
                type="number"
                placeholder="Fat (grams)"
                value={fatInput}
                onChange={(e) => setFatInput(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleAddOrUpdateMeal}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition duration-200 shadow-md"
                >
                  {editingMealId ? 'Save Changes' : 'Add Meal'}
                </button>
                {editingMealId && (
                  <button
                    onClick={handleCancelMealEdit}
                    className="flex-1 bg-gray-400 text-white py-3 rounded-lg font-semibold hover:bg-gray-500 transition duration-200 shadow-md"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Water Intake Input Section - Only visible for today's date */}
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">
              {editingWaterId ? 'Edit Water Entry' : 'Log Water Intake (Today)'}
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <input
                type="number"
                placeholder={`Water Amount (${getWaterUnit()})`}
                value={waterIntakeInput}
                onChange={(e) => setWaterIntakeInput(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleAddOrUpdateWater}
                  className="flex-1 bg-cyan-600 text-white py-3 rounded-lg font-semibold hover:bg-cyan-700 transition duration-200 shadow-md"
                >
                  {editingWaterId ? 'Save Changes' : 'Log Water'}
                </button>
                {editingWaterId && (
                  <button
                    onClick={handleCancelWaterEdit}
                    className="flex-1 bg-gray-400 text-white py-3 rounded-lg font-semibold hover:bg-gray-500 transition duration-200 shadow-md"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}


      {/* Totals Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Daily Totals for {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-green-100 p-3 rounded-lg">
            <span className="font-medium text-green-800">Net Carbs (Keto):</span>
            <span className="text-xl font-bold text-green-700">{netCarbsTotal.toFixed(1)}g</span>
          </div>
          <div className="flex justify-between items-center bg-purple-100 p-3 rounded-lg">
            <span className="font-medium text-purple-800">Total Carbs (Non-Keto):</span>
            <span className="text-xl font-bold text-purple-700">{nonNetCarbsTotal.toFixed(1)}g</span>
          </div>
          <div className="flex justify-between items-center bg-blue-100 p-3 rounded-lg">
            <span className="font-medium text-blue-800">Protein:</span>
            <span className="text-xl font-bold text-blue-700">{proteinTotal.toFixed(1)}g</span>
          </div>
          <div className="flex justify-between items-center bg-yellow-100 p-3 rounded-lg">
            <span className="font-medium text-yellow-800">Fat:</span>
            <span className="text-xl font-bold text-yellow-700">{fatTotal.toFixed(1)}g</span>
          </div>
          <div className="flex justify-between items-center bg-cyan-100 p-3 rounded-lg">
            <span className="font-medium text-cyan-800">Water Intake:</span>
            <span className="text-xl font-bold text-cyan-700">{displayWater(totalWaterToday)}{getWaterUnit()}</span>
          </div>
        </div>
        <button
          onClick={handleClearDay}
          className="w-full mt-6 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition duration-200 shadow-md"
        >
          Clear All Meals for {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </button>
        <button
          onClick={handleClearWaterDay}
          className="w-full mt-2 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition duration-200 shadow-md"
        >
          Clear All Water for {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </button>
      </div>

      {/* Meal List Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Meals for {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h2>
        {Array.isArray(meals) && meals.length === 0 ? (
          <p className="text-gray-500 text-center">No meals added for this day yet.</p>
        ) : (
          <div className="space-y-4">
            {mealTypeOrder.map(type => {
              const mealsOfType = groupedMeals[type];
              if (!mealsOfType || mealsOfType.length === 0) {
                return null; // Don't render section if no meals of this type
              }
              return (
                <div key={type} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">{type}</h3>
                  <ul className="space-y-2">
                    {mealsOfType
                      .sort((a, b) => (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp) - (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp))
                      .map((meal) => (
                        <li key={meal.id} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800">{meal.foodItem}</p>
                            <p className="text-sm text-gray-600">
                              Total: {meal.totalCarbs}g, Fiber: {meal.fiber}g, Net: {(meal.totalCarbs - meal.fiber).toFixed(1)}g
                            </p>
                            <p className="text-sm text-gray-600">
                              Protein: {meal.protein}g, Fat: {meal.fat}g
                            </p>
                          </div>
                          <div className="flex space-x-2 ml-4">
                            <button
                              onClick={() => handleEditMealClick(meal)}
                              className="p-2 bg-blue-400 text-white rounded-full hover:bg-blue-500 transition duration-200"
                              aria-label="Edit meal"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.586L10 14l-2 2-3 1 1-3 2-2 2.172-2.172a.5.5 0 01.707 0z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteMeal(meal.id)}
                              className="p-2 bg-red-400 text-white rounded-full hover:bg-red-500 transition duration-200"
                              aria-label="Delete meal"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Water Intake List Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Water Intake for {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h2>
        {Array.isArray(waterEntries) && waterEntries.length === 0 ? (
          <p className="text-gray-500 text-center">No water entries for this day yet.</p>
        ) : (
          <ul className="space-y-3">
            {Array.isArray(waterEntries) && waterEntries
              .sort((a, b) => (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp) - (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp))
              .map((entry) => (
                <li key={entry.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">
                      {new Date(entry.timestamp.toMillis ? entry.timestamp.toMillis() : entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}: {displayWater(entry.amount)}{getWaterUnit()}
                    </p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleEditWaterClick(entry)}
                      className="p-2 bg-blue-400 text-white rounded-full hover:bg-blue-500 transition duration-200"
                      aria-label="Edit water entry"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.586L10 14l-2 2-3 1 1-3 2-2 2.172-2.172a.5.5 0 01.707 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteWater(entry.id)}
                      className="p-2 bg-red-400 text-white rounded-full hover:bg-red-500 transition duration-200"
                      aria-label="Delete water entry"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Weight Tracking Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Weight Tracking</h2>
        <div className="grid grid-cols-1 gap-4 mb-4">
          <input
            type="number"
            placeholder={`Current Weight (${getWeightUnit()})`}
            value={currentWeightInput}
            onChange={(e) => setCurrentWeightInput(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <div className="flex space-x-2">
            <button
              onClick={handleAddOrUpdateWeight}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition duration-200 shadow-md"
            >
              {editingWeightId ? 'Save Changes' : 'Record Weight'}
            </button>
            {editingWeightId && (
              <button
                onClick={handleCancelWeightEdit}
                className="flex-1 bg-gray-400 text-white py-3 rounded-lg font-semibold hover:bg-gray-500 transition duration-200 shadow-md"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {Array.isArray(weightEntries) && weightEntries.length > 0 && (
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-center bg-blue-100 p-3 rounded-lg">
              <span className="font-medium text-blue-800">Starting Weight:</span>
              <span className="text-xl font-bold text-blue-700">{displayWeight(startingWeight)}{getWeightUnit()}</span>
            </div>
            <div className="flex justify-between items-center bg-yellow-100 p-3 rounded-lg">
              <span className="font-medium text-yellow-800">Weight Change:</span>
              <span className={`text-xl font-bold ${weightChange > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {displayWeight(Math.abs(weightChange))}{getWeightUnit()} ({weightChange > 0 ? 'Gain' : 'Loss'})
              </span>
            </div>
            {goalWeight && latestWeight && (
              <div className="flex justify-between items-center bg-purple-100 p-3 rounded-lg">
                <span className="font-medium text-purple-800">Remaining to Goal:</span>
                <span className={`text-xl font-bold ${remainingToGoal > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {displayWeight(Math.abs(remainingToGoal))}{getWeightUnit()} {remainingToGoal > 0 ? 'to lose' : 'achieved!'}
                </span>
              </div>
            )}
            {goalWeight && !latestWeight && (
              <div className="flex justify-between items-center bg-purple-100 p-3 rounded-lg">
                <span className="font-medium text-purple-800">Remaining to Goal:</span>
                <span className="text-xl font-bold text-gray-700">
                  Record current weight to see progress.
                </span>
              </div>
            )}
          </div>
        )}

        <h3 className="text-xl font-semibold mb-3 text-gray-700">Weight History</h3>
        {Array.isArray(weightEntries) && weightEntries.length === 0 ? (
          <p className="text-gray-500 text-center">No weight entries yet.</p>
        ) : (
          <>
            <div className="w-full h-64 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  key={JSON.stringify(chartData)} // Added key prop
                  data={chartData}
                  margin={{
                    top: 5,
                    right: 10,
                    left: 0,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" tickFormatter={(tick) => tick} />
                  <YAxis label={{ value: `Weight (${getWeightUnit()})`, angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    formatter={(value, name, props) => [`${value} ${getWeightUnit()}`, 'Weight']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#4F46E5"
                    activeDot={{ r: 8 }}
                    name="Weight"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {Array.isArray(weightEntries) && weightEntries.map((entry) => (
                <li key={entry.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg shadow-sm">
                  <span className="text-gray-800">
                    {new Date(entry.timestamp.toMillis ? entry.timestamp.toMillis() : entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}:
                    <span className="font-semibold ml-2">{displayWeight(entry.weight)} {getWeightUnit()}</span>
                  </span>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleEditWeightClick(entry)}
                      className="p-1 bg-blue-400 text-white rounded-full hover:bg-blue-500 transition duration-200"
                      aria-label="Edit weight entry"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.586L10 14l-2 2-3 1 1-3 2-2 2.172-2.172a.5.5 0 01.707 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteWeight(entry.id)}
                      className="p-1 bg-red-400 text-white rounded-full hover:bg-red-500 transition duration-200"
                      aria-label="Delete weight entry"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          onClick={handleClearAllWeights}
          className="w-full mt-6 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition duration-200 shadow-md"
        >
          Clear All Weight Entries
        </button>
      </div>

      {/* Find Keto Meals Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Find Keto Meals Online</h2>
        <div className="grid grid-cols-1 gap-4">
          <input
            type="text"
            placeholder="e.g., 'keto chicken recipes' or 'easy keto breakfast'"
            value={ketoSearchQuery}
            onChange={(e) => setKetoSearchQuery(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleKetoSearch(ketoSearchQuery);
              }
            }}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <button
            onClick={() => handleKetoSearch(ketoSearchQuery)}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition duration-200 shadow-md"
          >
            Search Keto Meals
          </button>
          <button
            onClick={() => handleKetoSearch('easy keto recipes')}
            className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition duration-200 shadow-md"
          >
            Quick Search: Easy Keto Recipes
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-4 text-center">
          (This will open search results in a new browser tab.)
        </p>
      </div>

      {/* Saved Keto Recipes Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Saved Keto Recipes</h2>
        <div className="grid grid-cols-1 gap-4 mb-4">
          <input
            type="text"
            placeholder="Recipe Title"
            value={recipeTitleInput}
            onChange={(e) => setRecipeTitleInput(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <input
            type="url"
            placeholder="Recipe URL (e.g., https://example.com/recipe)"
            value={recipeUrlInput}
            onChange={(e) => setRecipeUrlInput(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          />
          <textarea
            placeholder="Notes (optional)"
            value={recipeNotesInput}
            onChange={(e) => setRecipeNotesInput(e.target.value)}
            rows="3"
            className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 resize-y"
          ></textarea>
          <div className="flex space-x-2">
            <button
              onClick={handleAddOrUpdateRecipe}
              className="flex-1 bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition duration-200 shadow-md"
            >
              {editingRecipeId ? 'Save Recipe Changes' : 'Save Recipe'}
            </button>
            {editingRecipeId && (
              <button
                onClick={handleCancelRecipeEdit}
                className="flex-1 bg-gray-400 text-white py-3 rounded-lg font-semibold hover:bg-gray-500 transition duration-200 shadow-md"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <h3 className="text-xl font-semibold mb-3 text-gray-700">Your Saved Recipes</h3>
        {Array.isArray(savedRecipes) && savedRecipes.length === 0 ? (
          <p className="text-gray-500 text-center">No recipes saved yet.</p>
        ) : (
          <ul className="space-y-3 max-h-80 overflow-y-auto">
            {Array.isArray(savedRecipes) && savedRecipes.map((recipe) => (
              <li key={recipe.id} className="bg-gray-50 p-3 rounded-lg shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <a
                    href={recipe.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-700 hover:underline text-lg flex-1 mr-2"
                  >
                    {recipe.title}
                  </a>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditRecipeClick(recipe)}
                      className="p-1 bg-blue-400 text-white rounded-full hover:bg-blue-500 transition duration-200"
                      aria-label="Edit recipe"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.586L10 14l-2 2-3 1 1-3 2-2 2.172-2.172a.5.5 0 01.707 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteRecipe(recipe.id)}
                      className="p-1 bg-red-400 text-white rounded-full hover:bg-red-500 transition duration-200"
                      aria-label="Delete recipe"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                {recipe.notes && <p className="text-sm text-gray-600 italic">{recipe.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Monthly Meal Planner Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Monthly Meal Planner</h2>
        <div className="grid grid-cols-1 gap-4 mb-4">
          <input
            type="date"
            value={mealPlanDate}
            onChange={(e) => setMealPlanDate(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 text-lg"
          />
          <select
            value={selectedRecipeForPlan}
            onChange={(e) => setSelectedRecipeForPlan(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
          >
            <option value="">-- Select a Saved Recipe --</option>
            {Array.isArray(savedRecipes) && savedRecipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
          </select>
          <div className="flex space-x-2">
            <button
              onClick={handleAddOrUpdatePlannedMeal}
              className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition duration-200 shadow-md"
              disabled={!selectedRecipeForPlan}
            >
              {editingPlannedMealId ? 'Save Planned Meal Changes' : 'Plan Meal for Selected Date'}
            </button>
            {editingPlannedMealId && (
              <button
                onClick={handleCancelPlannedMealEdit}
                className="flex-1 bg-gray-400 text-white py-3 rounded-lg font-semibold hover:bg-gray-500 transition duration-200 shadow-md"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <h3 className="text-xl font-semibold mb-3 text-gray-700">Planned Meals for {new Date(mealPlanDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</h3>
        {Array.isArray(plannedMeals) && plannedMeals.length === 0 ? (
          <p className="text-gray-500 text-center">No meals planned for this date.</p>
        ) : (
          <ul className="space-y-3">
            {Array.isArray(plannedMeals) && plannedMeals.map((plannedMeal) => (
              <li key={plannedMeal.id} className="bg-gray-50 p-3 rounded-lg shadow-sm flex justify-between items-center">
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">
                    <a href={plannedMeal.recipeDetails?.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                      {plannedMeal.recipeDetails?.title || 'Unknown Recipe'}
                    </a>
                  </p>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => handleEditPlannedMealClick(plannedMeal)}
                    className="p-1 bg-blue-400 text-white rounded-full hover:bg-blue-500 transition duration-200"
                    aria-label="Edit planned meal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.586L10 14l-2 2-3 1 1-3 2-2 2.172-2.172a.5.5 0 01.707 0z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeletePlannedMeal(plannedMeal.id)}
                    className="p-1 bg-red-400 text-white rounded-full hover:bg-red-500 transition duration-200"
                    aria-label="Delete planned meal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>


      {/* Custom Confirmation Modal */}
      <ConfirmationModal
        message={modalMessage}
        onConfirm={modalAction}
        onCancel={() => setShowModal(false)}
        show={showModal}
      />
    </div>
  );
};

export default App;