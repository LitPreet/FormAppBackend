import { Router } from "express";
import { addQuestion, createNewForm, deleteForm, deleteFormQuestion, deleteFormResponseById, getAllForms, getCurrentUser, getFormByID, getFormResponseById, getQuestionByID, loginUser, refreshAccessToken, registerUser,  sendEmail,  submitFormResponse,  updateForm,  verifyOTP } from "../controllers/user.controller";
import { upload } from "../middlewares/multer.middleware";
import { verifyJWT } from "../middlewares/auth.middleware";

const router = Router()


router.route("/register").post(registerUser)
router.route("/verify-otp").post(verifyOTP)
router.route("/login").post(loginUser)
router.route("/send-email").post(sendEmail)
router.route("/refresh-token").post(refreshAccessToken);

//secured routes
router.route("/current-user").get(verifyJWT, getCurrentUser)
router.route("/create-form").post(verifyJWT, createNewForm)
router.route("/update-form/:formId").put(verifyJWT,updateForm)
router.route("/add-question").post(verifyJWT, addQuestion)
router.route("/delete-form/:formId").post(verifyJWT, deleteForm)
router.route("/delete-question/:questionId").delete(verifyJWT, deleteFormQuestion)
router.route("/get-allForms").get(verifyJWT, getAllForms)
router.route("/get-FormById/:formId").get(verifyJWT, getFormByID)
router.route("/get-questionById/:questionId").get(verifyJWT, getQuestionByID)
router.route("/get-FormResponse/:formId").get(verifyJWT, getFormResponseById)
router.route("/submit-formView/:formId").get(getFormByID);
router.route("/submission-form/:formId").post(submitFormResponse);
router.route("/deletform-response/:formId").delete(verifyJWT,deleteFormResponseById);


export default router