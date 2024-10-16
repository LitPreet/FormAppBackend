import { Router } from "express";
import { addQuestion, checkAuth, createNewForm, deleteForm, deleteFormQuestion, deleteFormResponseById, getAllForms, getCurrentUser, getFormByID, getFormResponseById, getQuestionByID, loginUser, refreshAccessToken, registerUser,  sendEmail,  sendFormUrlMail,  sendPasswordResetOTP,  submitFormResponse,  updateForm,  verifyOTP, verifyOtpAndChangePassword } from "../controllers/user.controller";
import { verifyJWT } from "../middlewares/auth.middleware";

const router = Router()


router.route("/register").post(registerUser)
router.route("/verify-otp").post(verifyOTP)
router.route("/login").post(loginUser)
router.route("/send-password-reset-otp").post(sendPasswordResetOTP);
router.route("/verify-otp-and-change-password").post(verifyOtpAndChangePassword);
router.route("/send-email").post(sendEmail)
router.route("/refresh-token").post(refreshAccessToken);

//secured routes
router.route('/check-auth').get(verifyJWT,checkAuth);
router.route("/current-user").get(verifyJWT, getCurrentUser)
router.route("/create-form").post(verifyJWT, createNewForm)
router.route("/update-form/:formId").put(verifyJWT,updateForm)
router.route("/add-question").post(verifyJWT, addQuestion)
router.route("/delete-form/:formId").delete(verifyJWT, deleteForm)
router.route("/delete-question/:questionId").delete(verifyJWT, deleteFormQuestion)
router.route("/get-allForms").get(verifyJWT, getAllForms)
router.route("/get-FormById/:formId").get(verifyJWT, getFormByID)
router.route("/get-questionById/:questionId").get(verifyJWT, getQuestionByID)
router.route("/get-FormResponse/:formId").get(verifyJWT, getFormResponseById)
router.route("/submit-formView/:formId").get(getFormByID);
router.route("/submission-form/:formId").post(submitFormResponse);
router.route("/send-formUrl").post(verifyJWT,sendFormUrlMail);
router.route("/deletform-response/:formId").delete(verifyJWT,deleteFormResponseById);


export default router