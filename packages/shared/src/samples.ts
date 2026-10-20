export const SAMPLE_QUESTIONS_CSV = [
  'topic,difficulty,stem,option_a,option_b,option_c,option_d,correct',
  'Databases,easy,Which command reads rows from a table?,SELECT,INSERT,DELETE,UPDATE,A',
  'Databases,medium,Which isolation level prevents dirty reads but allows non-repeatable reads?,Read committed,Read uncommitted,Serializable,Repeatable read,A',
  'Databases,hard,Which anomaly can still occur under repeatable read in some databases?,Dirty read,Phantom read,Lost update at commit,Torn write,B',
  'Networks,easy,Which protocol is used to load a web page?,HTTP,SMTP,FTP,SSH,A',
  'Networks,medium,"What does DNS do, in one line?",Translates names to addresses,Encrypts traffic,Assigns MAC addresses,Routes packets,A',
  'Algebra,easy,What is 3 x + 2 x?,5 x,6 x,x squared,5,A',
  '',
].join('\n');

export const SAMPLE_ROSTER_CSV = [
  'name,email',
  'Asha Rao,asha@example.com',
  'Ben Cole,ben@example.com',
  'Chen Wei,',
  'Dana Okafor,dana@example.com',
  '',
].join('\n');

export const SAMPLE_QUESTIONS_FILENAME = 'quizup-sample-questions.csv';
export const SAMPLE_ROSTER_FILENAME = 'quizup-sample-students.csv';
