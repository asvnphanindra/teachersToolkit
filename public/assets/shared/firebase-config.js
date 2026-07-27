import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvoZf6SVFIZjh88v5YHkkOWtgzWW410fs",
  authDomain: "teacherstoolkit-nriit.firebaseapp.com",
  projectId: "teacherstoolkit-nriit",
  storageBucket: "teacherstoolkit-nriit.firebasestorage.app",
  messagingSenderId: "31811030049",
  appId: "1:31811030049:web:991e6dcfc0f03c75f56760",
  measurementId: "G-MBPCZW9NS9",
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
