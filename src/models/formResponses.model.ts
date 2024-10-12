import mongoose, { Document, Model, Schema, Types } from "mongoose";

interface IAnswer {
    question: Types.ObjectId; 
    answer: string | string[]; 
    type: 'single' | 'multiple'; 
    questionText: string; 
  }
  
  interface IResponse extends Document{
    formID: Types.ObjectId;
    answers: IAnswer[];
  }

  const answerSchema = new Schema<IAnswer>({
    question: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true
    },
    answer: {
       type: [String], 
      required: true
    },
    type: {
        type: String,
        enum: ['single', 'multiple'], // Only allows 'single' or 'multiple' as valid values
        required: true,
      },
      questionText: { // New field to store question text
        type: String,
        required: true,
    }
  }, { _id: false }); // _id set to false because answer is a subdocument


const responseSchema = new Schema<IResponse>({
    formID: {
      type: Schema.Types.ObjectId,
      ref: "Form",
      required: true
    },
    answers: [answerSchema]
  }, { timestamps: true });  

  const FormResponse: Model<IResponse> = mongoose.model<IResponse>("FormResponse", responseSchema);

export { FormResponse };