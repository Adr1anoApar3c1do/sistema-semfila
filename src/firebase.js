// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuração do Firebase do projeto SemFila
const firebaseConfig = {
  apiKey: "AIzaSyBAZ3vlOpV5Xvg2tW66qKzmFnQWKsVniA0",
  authDomain: "sem-fila-921cf.firebaseapp.com",
  projectId: "sem-fila-921cf",
  storageBucket: "sem-fila-921cf.firebasestorage.app",
  messagingSenderId: "148739581085",
  appId: "1:148739581085:web:a8d25c88f90b4a1914e074"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa o Firestore Database
const db = getFirestore(app);

export { db };
export default app;