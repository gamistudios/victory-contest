import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import {
  CheckCircle,
  AlertCircle,
  BookOpen,
  Clock,
  Trophy,
  Users,
  Target,
} from "lucide-react";
import {
  getContestRegistration,
  registerForContest,
} from "../services/contestApi";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { ContestInfo } from "../types";

const Registration: React.FC = () => {
  const { user, hapticFeedback } = useTelegram();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    grade: "",
    subjects: [] as string[],
    experience: "",
    terms: false,
  });
  const [loading, _] = useState(false);
  const [registering, setRegistering] = useState<boolean>(false);
  const [contestInfo, setContestInfo] = useState<ContestInfo | null>(null);

  useEffect(() => {
    if (!location.state || !location.state.contestData) {
      toast.error("Something went wrong!", {
        icon: <AlertCircle className="w-5 h-5" />,
        duration: 3000,
        position: "top-center",
        style: {
          backgroundColor: "#f8d7da",
          color: "#721c24",
        },
      });
      navigate("/");
      return;
    }
    setContestInfo({ ...location.state.contestData });

    const fetchContestInfo = async () => {
      try {
        const registerations = await getContestRegistration(
          location.state.contestData.id
        );
        setContestInfo({
          ...location.state.contestData,
          participants: registerations,
        });
      } catch (error) {
        toast.error("Failed to fetch contest details", {
          icon: <AlertCircle className="w-5 h-5" />,
          duration: 3000,
          position: "top-center",
          style: {
            backgroundColor: "#f8d7da",
            color: "#721c24",
          },
        });
      }
    };
    fetchContestInfo();
  }, [location]);

  const availableSubjects = [
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "English",
    "History",
    "Geography",
    "Computer Science",
  ];

  const experienceLevels = [
    {
      value: "beginner",
      label: "Beginner",
      description: "New to competitive contests",
    },
    {
      value: "intermediate",
      label: "Intermediate",
      description: "Some contest experience",
    },
    {
      value: "advanced",
      label: "Advanced",
      description: "Experienced competitor",
    },
  ];

  const handleSubjectToggle = (subject: string) => {
    setFormData((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter((s) => s !== subject)
        : [...prev.subjects, subject],
    }));
    hapticFeedback("selection");
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
      hapticFeedback("impact", "light");
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    // handleContestClick();
    if (!user) {
      // console.log("user not found!");
      toast.warning("User not found! Please log in.", {
        icon: <AlertCircle className="w-5 h-5" />,
        duration: 3000,
        position: "top-right",
        style: {
          backgroundColor: "#fff3cd",
          color: "#856404",
        },
      });
      return;
    }
    setRegistering(true);
    try {
      await registerForContest(contestInfo?.id!, user!.id.toString());
      hapticFeedback("notification", "success");
      toast.success("Registration successful!", {
        icon: <CheckCircle className="w-5 h-5" />,
        duration: 3000,
        style: {
          backgroundColor: "#d4edda",
          color: "#155724",
        },
      });
      navigate("/");
    } catch (err) {
      // Optionally show error
      toast.error("Registration failed. Please try again.", {
        icon: <AlertCircle className="w-5 h-5" />,
        duration: 3000,
        style: {
          backgroundColor: "#f8d7da",
          color: "#721c24",
        },
      });
    } finally {
      setRegistering(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.grade !== "";
      case 2:
        return formData.subjects.length > 0;
      case 3:
        return formData.experience !== "" && formData.terms;
      default:
        return false;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
          Registering for Contest...
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-center">
          Please wait while we process your registration
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Contest Info Card */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-xl mb-6">
        <h2 className="text-xl font-bold mb-2 capitalize">
          {contestInfo?.title}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-2" />
            {contestInfo?.duration || "00:00"}
          </div>
          <div className="flex items-center">
            <Target className="w-4 h-4 mr-2" />
            {contestInfo?.questions || 0} questions
          </div>
          <div className="flex items-center">
            <Users className="w-4 h-4 mr-2" />
            {contestInfo?.participants || 0} participants
          </div>
          <div className="flex items-center">
            <Trophy className="w-4 h-4 mr-2" />
            {contestInfo?.prizes || "No prizes"}
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Step {step} of 3
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {Math.round((step / 3) * 100)}% Complete
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        {step === 1 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              What's your grade level?
            </h3>
            <div className="space-y-3">
              {["9th Grade", "10th Grade", "11th Grade", "12th Grade"].map(
                (grade) => (
                  <button
                    key={grade}
                    onClick={() => setFormData((prev) => ({ ...prev, grade }))}
                    className={`w-full p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      formData.grade === grade
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center">
                      <BookOpen className="w-5 h-5 mr-3" />
                      <span className="font-medium">{grade}</span>
                    </div>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Select your subjects of interest
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose one or more subjects you'd like to focus on
            </p>
            <div className="grid grid-cols-2 gap-3">
              {availableSubjects.map((subject) => (
                <button
                  key={subject}
                  onClick={() => handleSubjectToggle(subject)}
                  className={`p-3 rounded-lg border-2 transition-all duration-200 text-center ${
                    formData.subjects.includes(subject)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="font-medium text-sm">{subject}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Selected: {formData.subjects.length} subjects
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Almost done! Just a few more details
            </h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Contest Experience Level
                </label>
                <div className="space-y-3">
                  {experienceLevels.map((level) => (
                    <button
                      key={level.value}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          experience: level.value,
                        }))
                      }
                      className={`w-full p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                        formData.experience === level.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className="font-medium">{level.label}</div>
                      <div className="text-sm opacity-75">
                        {level.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={formData.terms}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        terms: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="terms"
                    className="ml-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    I agree to the{" "}
                    <a
                      href="#"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      contest rules
                    </a>{" "}
                    and{" "}
                    <a
                      href="#"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      privacy policy
                    </a>
                  </label>
                </div>
              </div>

              {/* Registration Summary */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <h4 className="font-medium text-gray-800 dark:text-white mb-2">
                  Registration Summary
                </h4>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>Grade: {formData.grade}</div>
                  <div>Subjects: {formData.subjects.join(", ")}</div>
                  <div>
                    Experience:{" "}
                    {
                      experienceLevels.find(
                        (l) => l.value === formData.experience
                      )?.label
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-6">
        <Button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            step === 1
              ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed"
              : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          }`}
        >
          Previous
        </Button>

        <Button
          onClick={handleNext}
          disabled={!isStepValid() || registering}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isStepValid() && !registering
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          }`}
        >
          {step !== 3
            ? "Next"
            : registering
            ? "Registering"
            : "Complete Registeration"}
        </Button>
      </div>
    </div>
  );
};

export default Registration;
