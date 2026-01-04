import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles, Truck, Shield, Eye, EyeOff } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Role selection for signup
  const [selectedRole, setSelectedRole] = useState<"driver" | "manager">("driver");
  const [managerCode, setManagerCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  const verifyManagerCode = async (): Promise<boolean> => {
    if (selectedRole !== "manager") return true;
    
    setVerifyingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-manager-code', {
        body: { code: managerCode }
      });
      
      if (error) throw error;
      
      if (!data.valid) {
        toast.error("Invalid manager code. Please check and try again.");
        return false;
      }
      
      return true;
    } catch (error: any) {
      console.error("Error verifying manager code:", error);
      toast.error("Could not verify manager code. Please try again.");
      return false;
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate("/");
      } else {
        // Verify manager code if manager role selected
        if (selectedRole === "manager") {
          const isValidCode = await verifyManagerCode();
          if (!isValidCode) {
            setLoading(false);
            return;
          }
        }

        // Determine the role to assign
        const role = selectedRole === "manager" ? "Sales Rep" : "Customer";

        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName,
              role: role,
            },
          },
        });
        if (error) throw error;
        
        // Send custom welcome email
        try {
          await supabase.functions.invoke('send-custom-auth-email', {
            body: {
              type: 'signup',
              email: email,
              name: fullName,
              redirectUrl: `${window.location.origin}/auth`
            }
          });
        } catch (emailError) {
          console.log('Welcome email could not be sent:', emailError);
        }
        
        toast.success("Account created! Check your email for confirmation.");
        setIsLogin(true);
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-card)] animate-scale-in">
        <CardHeader className="text-center space-y-3 p-4 sm:p-6">
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          </div>
          <CardTitle className="text-xl sm:text-2xl">Salon Supply Manager</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {isLogin ? "Sign in to your account" : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={!isLogin}
                    className="h-11 min-h-[44px]"
                  />
                </div>
                
                {/* Role Selection */}
                <div className="space-y-3">
                  <Label>I am a...</Label>
                  <RadioGroup 
                    value={selectedRole} 
                    onValueChange={(value) => setSelectedRole(value as "driver" | "manager")}
                    className="grid grid-cols-2 gap-3"
                  >
                    <Label
                      htmlFor="role-driver"
                      className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all min-h-[100px] ${
                        selectedRole === "driver" 
                          ? "border-primary bg-primary/5" 
                          : "border-muted hover:border-muted-foreground/50"
                      }`}
                    >
                      <RadioGroupItem value="driver" id="role-driver" className="sr-only" />
                      <Truck className={`h-8 w-8 mb-2 ${selectedRole === "driver" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`font-medium ${selectedRole === "driver" ? "text-primary" : ""}`}>Driver</span>
                      <span className="text-xs text-muted-foreground mt-1">View orders only</span>
                    </Label>
                    
                    <Label
                      htmlFor="role-manager"
                      className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all min-h-[100px] ${
                        selectedRole === "manager" 
                          ? "border-primary bg-primary/5" 
                          : "border-muted hover:border-muted-foreground/50"
                      }`}
                    >
                      <RadioGroupItem value="manager" id="role-manager" className="sr-only" />
                      <Shield className={`h-8 w-8 mb-2 ${selectedRole === "manager" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`font-medium ${selectedRole === "manager" ? "text-primary" : ""}`}>Manager</span>
                      <span className="text-xs text-muted-foreground mt-1">Full access</span>
                    </Label>
                  </RadioGroup>
                </div>

                {/* Manager Code Input */}
                {selectedRole === "manager" && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="managerCode">Manager Code</Label>
                    <Input
                      id="managerCode"
                      type="password"
                      placeholder="Enter manager code"
                      value={managerCode}
                      onChange={(e) => setManagerCode(e.target.value)}
                      required={selectedRole === "manager"}
                      className="h-11 min-h-[44px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact your administrator to get the manager code
                    </p>
                  </div>
                )}
              </>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11 min-h-[44px] pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-11 min-h-[44px]" 
              disabled={loading || verifyingCode}
            >
              {loading || verifyingCode 
                ? "Please wait..." 
                : isLogin 
                  ? "Sign In" 
                  : `Sign Up as ${selectedRole === "manager" ? "Manager" : "Driver"}`
              }
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setSelectedRole("driver");
                setManagerCode("");
              }}
              className="text-primary hover:underline py-2 px-4 min-h-[44px] touch-manipulation"
            >
              {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;