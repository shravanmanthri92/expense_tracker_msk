import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { fetchHousehold, fetchHouseholdMembers } from "../services/householdService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = initial loading
  const [profile, setProfile] = useState(null);
  const [household, setHousehold] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Keep a ref to the current session so refreshProfile can access it without stale closure
  const sessionRef = useRef(null);

  const loadHousehold = async (householdId) => {
    const [{ data: hh }, { data: members }] = await Promise.all([
      fetchHousehold(householdId),
      fetchHouseholdMembers(householdId),
    ]);
    setHousehold(hh || null);
    setHouseholdMembers(members || []);
  };

  const loadProfile = async (user) => {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    let profileData = data;

    if (error && error.code === "PGRST116") {
      // Row not found — create it
      const { data: created } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          display_name: user.user_metadata?.display_name || user.email.split("@")[0],
          default_currency: "INR",
        })
        .select()
        .single();
      profileData = created;
    }

    setProfile(profileData || null);

    // Load the household if the profile has one
    if (profileData?.household_id) {
      await loadHousehold(profileData.household_id);
    } else {
      setHousehold(null);
    }

    setProfileLoading(false);
  };

  // Call this after an action that changes the profile (e.g. CreateHousehold)
  const refreshProfile = async () => {
    const user = sessionRef.current?.user;
    if (user) await loadProfile(user);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionRef.current = session;
      setSession(session);
      if (session?.user) loadProfile(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      sessionRef.current = session;
      setSession(session);
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setIsPasswordRecovery(false);
        setProfile(null);
        setHousehold(null);
        setHouseholdMembers([]);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async ({ email, password, displayName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return { data, error };
  };

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/",
    });
    return { data, error };
  };

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    return { data, error };
  };

  const updateProfile = async (updates) => {
    if (!sessionRef.current?.user) return { error: new Error("Not logged in") };
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", sessionRef.current.user.id)
      .select()
      .single();
    if (!error) setProfile(data);
    return { data, error };
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    household,
    householdId: household?.id ?? null,
    householdMembers,
    loading: session === undefined,
    profileLoading,
    isPasswordRecovery,
    clearPasswordRecovery,
    refreshProfile,
    setHousehold,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
