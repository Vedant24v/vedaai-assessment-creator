import mongoose, { Schema, Document } from 'mongoose';
import { GeneratedPaper } from '../lib/paperGeneration';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IQuestionType {
  type: string;
  count: number;
  marks: number;
}

export interface IAssignment extends Document {
  title: string;
  subject: string;
  className: string;
  dueDate: Date;
  totalMarks: number;
  duration: number;
  questionTypes: IQuestionType[];
  additionalInstructions?: string;
  uploadedFileUrl?: string;
  uploadedFileName?: string;
  jobId?: string;
  jobStatus: JobStatus;
  jobError?: string;
  generatedPaper?: GeneratedPaper;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionTypeSchema = new Schema<IQuestionType>({
  type: { type: String, required: true },
  count: { type: Number, required: true, min: 1 },
  marks: { type: Number, required: true, min: 1 },
});

const AssignmentSchema = new Schema<IAssignment>(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    className: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    totalMarks: { type: Number, required: true, min: 1 },
    duration: { type: Number, default: 45 },
    questionTypes: { type: [QuestionTypeSchema], required: true },
    additionalInstructions: { type: String },
    uploadedFileUrl: { type: String },
    uploadedFileName: { type: String },
    jobId: { type: String },
    jobStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    jobError: { type: String },
    generatedPaper: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for total questions
AssignmentSchema.virtual('totalQuestions').get(function (this: IAssignment) {
  return this.questionTypes.reduce((sum, qt) => sum + qt.count, 0);
});

export const Assignment = mongoose.model<IAssignment>('Assignment', AssignmentSchema);
